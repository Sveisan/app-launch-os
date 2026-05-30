// Brief → video pipeline. Used by POST /api/video-studio/brief.
//
// Flow:
//   1. Source image: either the freelancer's upload, or Flux 1.1 Pro
//      generated from the brief.
//   2. Animate the image into a ~10s clip with Kling v1.6 (image-to-video).
//   3. Upload the MP4 to Dropbox at /Videos/<timestamp>-<slug>.mp4 (inside
//      the app folder), get a shared link, return it.
//
// All costs are per-generation Replicate spend. Roughly $0.04 for Flux +
// $0.30-0.50 for Kling. Skipping image gen by uploading drops it to ~$0.40.

const Replicate = require('replicate')
const { Dropbox, DropboxAuth } = require('dropbox')

const FLUX_MODEL = 'black-forest-labs/flux-1.1-pro'
const KLING_MODEL = 'kwaivgi/kling-v1.6-standard'

function buildReplicate() {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN missing in environment')
  }
  return new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
}

// Build a Dropbox client. Supports two auth modes:
//   1. Refresh-token flow (preferred): set DROPBOX_APP_KEY + DROPBOX_APP_SECRET +
//      DROPBOX_REFRESH_TOKEN — the SDK rotates access tokens automatically.
//   2. Static access token (legacy): set DROPBOX_ACCESS_TOKEN — expires in ~4 h,
//      requires manual rotation in Railway.
//
// Verified end-to-end with an "App folder" app on a Business team account
// (Lokebox); the SDK's default scoping works with files.{content,metadata}.
// {read,write} + sharing.write scopes.
async function buildDropbox() {
  const hasRefreshFlow =
    process.env.DROPBOX_APP_KEY &&
    process.env.DROPBOX_APP_SECRET &&
    process.env.DROPBOX_REFRESH_TOKEN

  if (!hasRefreshFlow && !process.env.DROPBOX_ACCESS_TOKEN) {
    throw new Error(
      'Dropbox not configured — set DROPBOX_ACCESS_TOKEN ' +
      '(or DROPBOX_APP_KEY + DROPBOX_APP_SECRET + DROPBOX_REFRESH_TOKEN) in Railway'
    )
  }

  let dbx
  if (hasRefreshFlow) {
    const auth = new DropboxAuth({
      clientId: process.env.DROPBOX_APP_KEY,
      clientSecret: process.env.DROPBOX_APP_SECRET,
      refreshToken: process.env.DROPBOX_REFRESH_TOKEN,
      fetch,
    })
    dbx = new Dropbox({ auth, fetch })
  } else {
    dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN, fetch })
  }

  // Pre-flight: fail fast (and don't burn Replicate credit) if the token is
  // broken, expired, or missing scopes.
  try {
    await dbx.usersGetCurrentAccount()
  } catch (err) {
    const msg = (err && err.message) || ''
    if (msg.includes('401') || (err && err.status === 401)) {
      throw new Error(
        hasRefreshFlow
          ? 'Dropbox refresh token is invalid or revoked — re-authorise the app and update Railway env vars'
          : 'Dropbox access token has expired — update DROPBOX_ACCESS_TOKEN in Railway settings (or switch to refresh-token flow)'
      )
    }
    throw err
  }

  return dbx
}

function slugify(s) {
  return String(s || 'video')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'video'
}

// Replicate's JS client returns either a URL string, a ReadableStream, or
// a FileOutput object with .url(). Normalize to a string URL.
function outputToUrl(output) {
  if (typeof output === 'string') return output
  if (Array.isArray(output)) return outputToUrl(output[0])
  if (output && typeof output.url === 'function') return output.url().toString()
  if (output && output.url) return String(output.url)
  throw new Error('Unexpected Replicate output shape: ' + typeof output)
}

async function runBrief({ brief, imageBuffer, imageMime, onProgress = () => {} }) {
  const replicate = buildReplicate()

  // Build Dropbox client up front so we fail fast (and don't burn Replicate
  // credit) if the token is broken or the app is misconfigured.
  onProgress({ phase: 'connecting', label: 'Checking Dropbox…' })
  const dbx = await buildDropbox()

  // Step 1: source image
  let imageInput
  if (imageBuffer) {
    onProgress({ phase: 'uploading-image', label: 'Reading your image…' })
    const b64 = imageBuffer.toString('base64')
    imageInput = `data:${imageMime || 'image/jpeg'};base64,${b64}`
  } else {
    onProgress({ phase: 'generating-image', label: 'Generating image (Flux 1.1 Pro)…' })
    const prompt = `${brief}. iPhone 16 Pro photo, cinematic, atmospheric, natural light, shallow depth of field`
    const flux = await replicate.run(FLUX_MODEL, {
      input: {
        prompt,
        aspect_ratio: '9:16',
        output_format: 'jpg',
        output_quality: 90,
        safety_tolerance: 2,
      },
    })
    imageInput = outputToUrl(flux)
  }

  // Step 2: animate
  onProgress({ phase: 'animating', label: 'Animating (Kling v1.6)…' })
  const klingInput = {
    prompt: brief || 'slow, atmospheric, gentle motion',
    start_image: imageInput,
    duration: 10,
    aspect_ratio: '9:16',
    cfg_scale: 0.5,
  }
  const kling = await replicate.run(KLING_MODEL, { input: klingInput })
  const videoUrl = outputToUrl(kling)

  // Step 3: download to buffer
  onProgress({ phase: 'downloading', label: 'Downloading…' })
  const videoResp = await fetch(videoUrl)
  if (!videoResp.ok) {
    throw new Error(`Failed to download video: ${videoResp.status}`)
  }
  const videoBuffer = Buffer.from(await videoResp.arrayBuffer())

  // Step 4: upload to Dropbox
  onProgress({ phase: 'uploading-dropbox', label: 'Saving to Dropbox…' })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `${stamp}-${slugify(brief)}.mp4`
  const dropboxPath = `/Videos/${filename}`

  await dbx.filesUpload({
    path: dropboxPath,
    contents: videoBuffer,
    mode: { '.tag': 'add' },
    autorename: true,
    mute: true,
  })

  // Step 5: get a shareable link
  onProgress({ phase: 'finalizing', label: 'Finalizing…' })
  let shareUrl
  try {
    const linkResp = await dbx.sharingCreateSharedLinkWithSettings({
      path: dropboxPath,
      settings: { requested_visibility: { '.tag': 'public' } },
    })
    shareUrl = linkResp.result.url
  } catch (err) {
    const summary = err && err.error && err.error.error_summary
    if (summary && summary.includes('shared_link_already_exists')) {
      const list = await dbx.sharingListSharedLinks({ path: dropboxPath, direct_only: true })
      shareUrl = list.result.links[0] && list.result.links[0].url
    } else {
      throw err
    }
  }

  return {
    dropboxPath,
    shareUrl,
    sourceImage: imageInput.startsWith('data:') ? null : imageInput,
    rawVideoUrl: videoUrl,
    durationSeconds: 10,
  }
}

module.exports = { runBrief }
