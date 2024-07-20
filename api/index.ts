const express = require('express');
const ytdl = require('@distube/ytdl-core');
const cors = require('cors');
const bodyParser = require('body-parser');
const tmp = require('tmp');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { alldl } = require('rahad-all-downloader');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());

ffmpeg.setFfmpegPath(ffmpegPath);

const isYoutubeUrl = (url) => {
  const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
  return regex.test(url);
};

const isTwitterUrl = (url) => {
  const regex = /[(?:https?:\/\/(?:twitter|x)\.com)](\/(?:#!\/)?(\w+)\/status(es)?\/(\d+))/;
  return regex.test(url);
};

const isRedditUrl = (url) => {
  const regex = /^(https?:\/\/)?(www\.)?(reddit\.[a-zA-Z]{2,}|redd\.it)\/.+$/;
  return regex.test(url);
};

const getRedditVideoUrl = async (url) => {
  try {
    const response = await axios.get(`${url}.json`);
    const postData = response.data[0].data.children[0].data;
    const videoUrl = postData.secure_media.reddit_video.fallback_url;

    return videoUrl;
  } catch (error) {
    console.error('Error fetching Reddit video URL:', error);
    return null;
  }
};

app.post('/api/download', async (req, res) => {
  let { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  if (isYoutubeUrl(url)) {
    try {
      // Create temporary files for video and audio
      const videoTmp = tmp.fileSync();
      const audioTmp = tmp.fileSync();
      const outputTmp = tmp.fileSync({ postfix: '.mp4' });

      // Get video info
      const info = await ytdl.getInfo(url);
      const title = info.videoDetails.title.replace(/[^a-zA-Z0-9]/g, '_'); // Sanitize title

      // Download video and audio streams
      const videoStream = ytdl(url, { filter: 'videoonly' }).pipe(fs.createWriteStream(videoTmp.name));

      videoStream.on('finish', () => {
        console.log('Video download finished');
        const audioStream = ytdl(url, { filter: 'audioonly' }).pipe(fs.createWriteStream(audioTmp.name));

        audioStream.on('finish', () => {
          console.log('Audio download finished');

          // Combine video and audio using ffmpeg
          ffmpeg()
            .input(videoTmp.name)
            .input(audioTmp.name)
            .outputOptions('-c:v copy')
            .outputOptions('-c:a aac')
            .save(outputTmp.name)
            .on('end', () => {
              console.log('Combining video and audio finished');

              // Send the file for download
              res.download(outputTmp.name, `${title}.mp4`, (err) => {
                if (err) {
                  console.error('Error sending file:', err);
                  res.status(500).json({ error: 'Error sending file' });
                } else {
                  console.log('Download sent successfully');
                  // Clean up temporary files
                  videoTmp.removeCallback();
                  audioTmp.removeCallback();
                  outputTmp.removeCallback();
                }
              });
            })
            .on('error', (err) => {
              console.error('Error combining video and audio:', err);
              res.status(500).json({ error: 'Error combining video and audio' });
              // Clean up temporary files in case of error
              videoTmp.removeCallback();
              audioTmp.removeCallback();
              outputTmp.removeCallback();
            });
        });

        audioStream.on('error', (err) => {
          console.error('Error downloading audio:', err);
          res.status(500).json({ error: 'Error downloading audio' });
          // Clean up temporary files in case of error
          videoTmp.removeCallback();
          audioTmp.removeCallback();
        });
      });

      videoStream.on('error', (err) => {
        console.error('Error downloading video:', err);
        res.status(500).json({ error: 'Error downloading video' });
        // Clean up temporary files in case of error
        videoTmp.removeCallback();
      });
    } catch (error) {
      console.error('Error downloading video:', error);
      res.status(500).json({ error: 'Error downloading video' });
    }
  } else if (isTwitterUrl(url)) {
    res.status(500).json({ error: 'Not supported yet' });
  } else if (isRedditUrl(url)) {
    try {
      const videoUrl = await getRedditVideoUrl(url);
      if (!videoUrl) {
        return res.status(404).json({ error: 'Video URL not found' });
      }

      const videoTmp = tmp.fileSync({ postfix: '.mp4' });

      const response = await axios({
        url: videoUrl,
        method: 'GET',
        responseType: 'stream',
      });

      response.data.pipe(fs.createWriteStream(videoTmp.name))
        .on('finish', () => {
          console.log('Video downloaded successfully');
          res.download(videoTmp.name, `reddit_video.mp4`, (err) => {
            if (err) {
              console.error('Error sending file:', err);
              res.status(500).json({ error: 'Error sending file' });
            } else {
              videoTmp.removeCallback();
            }
          });
        })
        .on('error', (err) => {
          console.error('Error downloading video:', err);
          res.status(500).json({ error: 'Error downloading video' });
          videoTmp.removeCallback();
        });

    } catch (error) {
      console.error('Error:', error.message);
      res.status(500).json({ error: 'Error downloading video' });
    }
  } else {
    try {
      const result = await alldl(url);
      const videoUrl = result.data.videoUrl;
      const videoTmp = tmp.fileSync({ postfix: '.mp4' });

      const response = await axios({
        url: videoUrl,
        method: 'GET',
        responseType: 'stream'
      });

      response.data.pipe(fs.createWriteStream(videoTmp.name))
        .on('finish', () => {
          console.log('Video downloaded successfully');
          res.download(videoTmp.name, `video.mp4`, (err) => {
            if (err) {
              console.error('Error sending file:', err);
              res.status(500).json({ error: 'Error sending file' });
            } else {
              videoTmp.removeCallback();
            }
          });
        })
        .on('error', (err) => {
          console.error('Error downloading video:', err);
          res.status(500).json({ error: 'Error downloading video' });
          videoTmp.removeCallback();
        });

    } catch (error) {
      console.error('Error:', error.message);
      res.status(500).json({ error: 'Error downloading video' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
