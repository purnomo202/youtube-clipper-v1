# YouTube Clipper V1

Mobile-first web app:
- Paste YouTube URL
- Read public metadata
- Select start/end
- Download/process authorized content server-side
- Render 9:16 MP4 with FFmpeg
- Crop left/center/right
- Max 3 minutes per clip

## Run locally

Requirements:
- Docker recommended

Build:
docker build -t youtube-clipper-v1 .

Run:
docker run --rm -p 3000:3000 youtube-clipper-v1

Open on the same device:
http://localhost:3000

For a phone, deploy the Docker container to a server platform and open its HTTPS URL in Chrome.

## Important

This project is intended for videos the user owns or is authorized to process. The backend uses yt-dlp to retrieve a source and FFmpeg to render the clip. Hosting providers may impose storage, CPU, bandwidth, and runtime limits.

## Next versions

V1.1:
- drag handles for timestamps
- actual video preview
- progress updates
- automatic cleanup

V2:
- transcript extraction
- AI highlight detection
- multiple recommended clips
- auto captions
- hook/title suggestions
