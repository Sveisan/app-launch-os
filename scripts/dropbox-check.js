// Diagnose the Dropbox token: verify auth, show which account it belongs to,
// list /Videos/, and write a tiny test file. Tries multiple namespace/scoping
// variants so we can see which one a Business team account actually accepts.
//
// Run locally:
//   DROPBOX_ACCESS_TOKEN='sl.u.YOUR_TOKEN' node scripts/dropbox-check.js

const { Dropbox } = require('dropbox')

async function dumpError(err) {
  const summary = err && err.error && err.error.error_summary
  if (summary) {
    console.log('       error_summary:', summary)
    return
  }
  // The SDK wraps the raw Response; try to recover the text body.
  if (err && err.error && typeof err.error.text === 'function') {
    try { console.log('       body:', await err.error.text()) } catch (_) {}
  }
  if (err && err.status) console.log('       status:', err.status)
  if (err && err.headers && err.headers.get) {
    const reqId = err.headers.get('x-dropbox-request-id')
    if (reqId) console.log('       x-dropbox-request-id:', reqId)
  }
  if (err && typeof err.error === 'object') {
    try { console.log('       raw error:', JSON.stringify(err.error).slice(0, 500)) } catch (_) {}
  }
  console.log('       message:', err.message)
}

async function tryWrite(label, dbx) {
  const stamp = Date.now()
  const testPath = `/_dropbox-check-${stamp}.txt`
  try {
    await dbx.filesUpload({
      path: testPath,
      contents: Buffer.from(`hello ${new Date().toISOString()}`),
      mode: { '.tag': 'add' },
      autorename: true,
      mute: true,
    })
    console.log(`✅ [${label}] Test write succeeded at ${testPath}`)
    return true
  } catch (err) {
    console.log(`❌ [${label}] Test write failed:`)
    await dumpError(err)
    return false
  }
}

async function main() {
  const token = process.env.DROPBOX_ACCESS_TOKEN
  if (!token) {
    console.error('❌ DROPBOX_ACCESS_TOKEN is not set.')
    process.exit(1)
  }
  console.log('Token present (length:', token.length, 'starts with:', token.slice(0, 6) + '...)\n')

  const baseDbx = new Dropbox({ accessToken: token, fetch })

  // 1) Whose token is this?
  let me
  try {
    const r = await baseDbx.usersGetCurrentAccount()
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
    console.error('❌ Auth failed:')
    await dumpError(err)
    process.exit(2)
  }

  // 2) Try several variants
  const home = me.root_info && me.root_info.home_namespace_id
  const member = me.team_member_id

  const variants = [
    { label: 'no pathRoot', opts: { accessToken: token, fetch } },
    { label: 'pathRoot=home', opts: { accessToken: token, fetch, pathRoot: JSON.stringify({ '.tag': 'home' }) } },
  ]
  if (home) {
    variants.push({
      label: `pathRoot=namespace_id(${home})`,
      opts: { accessToken: token, fetch, pathRoot: JSON.stringify({ '.tag': 'namespace_id', namespace_id: String(home) }) },
    })
  }
  if (member) {
    variants.push({
      label: `selectUser=${member.slice(0, 14)}…`,
      opts: { accessToken: token, fetch, selectUser: member },
    })
    if (home) {
      variants.push({
        label: 'selectUser + pathRoot=home',
        opts: { accessToken: token, fetch, selectUser: member, pathRoot: JSON.stringify({ '.tag': 'home' }) },
      })
    }
  }

  let winner = null
  for (const v of variants) {
    console.log(`\n--- Trying: ${v.label} ---`)
    const dbx = new Dropbox(v.opts)
    if (await tryWrite(v.label, dbx)) {
      winner = v
      break
    }
  }

  if (winner) {
    console.log('\n🎯 WORKING CONFIG:', winner.label)
    console.log('   Look for the _dropbox-check-*.txt file in Dropbox to confirm location.')
  } else {
    console.log('\n❌ None of the variants worked. The app config itself is the problem — most likely the token was generated before files.content.write was checked-and-submitted. Re-submit permissions, then re-generate the token.')
    process.exit(3)
  }
}

main().catch(err => { console.error('Unexpected:', err); process.exit(99) })
