// Diagnose the Dropbox token: verify auth, show which account it belongs to,
// list /Videos/, and write a tiny test file.
//
// Run locally with the public URL trick (you already know this pattern):
//   DROPBOX_ACCESS_TOKEN='sl.your-token' node scripts/dropbox-check.js

const { Dropbox } = require('dropbox')

async function main() {
  const token = process.env.DROPBOX_ACCESS_TOKEN
  if (!token) {
    console.error('❌ DROPBOX_ACCESS_TOKEN is not set in your shell.')
    process.exit(1)
  }
  console.log('Token present (length:', token.length, 'starts with:', token.slice(0, 6) + '...)\n')

  let dbx = new Dropbox({ accessToken: token, fetch })

  // 1) Whose token is this?
  let me
  try {
    const r = await dbx.usersGetCurrentAccount()
    me = r.result
    console.log('✅ Auth works.')
    console.log('   Account:', me.email)
    console.log('   Name:   ', me.name && me.name.display_name)
    console.log('   Type:   ', me.account_type && me.account_type['.tag'])
    if (me.team) {
      console.log('   Team:   ', me.team.name)
      console.log('   Member: ', me.team_member_id || '(none)')
      console.log('   Root NS:', me.root_info && me.root_info.root_namespace_id)
      console.log('   Home NS:', me.root_info && me.root_info.home_namespace_id)
    }
    console.log('')
  } catch (err) {
    console.error('❌ Auth failed:', err && err.error_summary ? err.error_summary : err)
    process.exit(2)
  }

  // For team accounts, file ops need to be scoped to the user's home namespace
  // (otherwise calls land in the team root and return 400). Re-create the
  // client with pathRoot set to the user's home.
  if (me.team && me.root_info && me.root_info.home_namespace_id) {
    const homeNs = me.root_info.home_namespace_id
    console.log('ℹ️  Team account detected — scoping file ops to home namespace', homeNs, '\n')
    dbx = new Dropbox({
      accessToken: token,
      fetch,
      pathRoot: JSON.stringify({ '.tag': 'namespace_id', namespace_id: homeNs }),
    })
  }

  // 2) What's in /Videos/?
  try {
    const list = await dbx.filesListFolder({ path: '/Videos' })
    console.log('✅ /Videos folder exists. Entries:', list.result.entries.length)
    list.result.entries.slice(0, 10).forEach(e => {
      console.log('   -', e.name, '(' + (e['.tag']) + ')')
    })
    console.log('')
  } catch (err) {
    const summary = err && err.error && err.error.error_summary
    if (summary && summary.startsWith('path/not_found')) {
      console.log('ℹ️  /Videos folder does not exist yet (this is fine — it gets created on first upload).\n')
    } else {
      console.warn('⚠️  Could not list /Videos:', summary || err.message)
    }
  }

  // 3) Try a real write
  try {
    const stamp = Date.now()
    const testPath = `/_dropbox-check-${stamp}.txt`
    await dbx.filesUpload({
      path: testPath,
      contents: Buffer.from(`Hello from dropbox-check at ${new Date().toISOString()}`),
      mode: { '.tag': 'add' },
      autorename: true,
      mute: true,
    })
    console.log('✅ Test write succeeded at', testPath)
    console.log('   → Look for this file in Dropbox to confirm where the app folder actually lives.')
  } catch (err) {
    const summary = err && err.error && err.error.error_summary
    console.error('❌ Test write FAILED:', summary || err.message)
    console.error('   This is the same call /api/video-studio/brief makes. Whatever this error is, it explains why videos vanish.')
    if (summary && summary.includes('missing_scope')) {
      console.error('   → Your Dropbox app is missing the files.content.write permission. Go to https://www.dropbox.com/developers/apps, open your app, Permissions tab, check files.content.write and files.content.read, hit Submit, then GENERATE A NEW TOKEN (existing tokens don\'t inherit new scopes).')
    }
    process.exit(3)
  }
}

main().catch(err => { console.error('Unexpected:', err); process.exit(99) })
