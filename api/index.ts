'use strict';
const Writable = require("stream");
const express = require('express');
const ytdl = require('@distube/ytdl-core');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const PORT = 5000;
const { alldl } = require('rahad-all-downloader');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const tt = require('twitter-dl');

app.use(cors());
app.use(bodyParser.json());

ffmpeg.setFfmpegPath(ffmpegPath);

const isYoutubeUrl = (url) => {
  const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
  return regex.test(url);
};

const isTwitterUrl = (url) => {
  const regex = /[(?:https?:\/\/(?:twitter|x)\.com)](\/(?:#!\/)?(\w+)\/status(es)?\/(\d+))/
  return regex.test(url);
}

const twitterApi = async (url) => {
  const res = await axios.post("https://ssyoutube-api.sansekai.repl.co/api/twitter", {
    url: url,
  });
  return res.data;
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

app.post('/download', async (req, res) => {
  let { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  if(isYoutubeUrl(url)) {
    try {
      // Get video info
      const info = await ytdl.getInfo(url);
      const title = info.videoDetails.title.replace(/[^a-zA-Z0-9]/g, '_'); // Sanitize title
      const videoPath = path.resolve(__dirname, `${title}_video.mp4`);
      const audioPath = path.resolve(__dirname, `${title}_audio.mp4`);
      const outputPath = path.resolve(__dirname, `${title}.mp4`);
  
      // Download video and audio streams
      const videoStream = ytdl(url, { filter: 'videoonly' }).pipe(fs.createWriteStream(videoPath));
  
      videoStream.on('finish', () => {
        console.log('Video download finished');
        const audioStream = ytdl(url, { filter: 'audioonly' }).pipe(fs.createWriteStream(audioPath));
  
        audioStream.on('finish', () => {
          console.log('Audio download finished');
  
          // Combine video and audio using ffmpeg
          ffmpeg()
            .input(videoPath)
            .input(audioPath)
            .outputOptions('-c:v copy')
            .outputOptions('-c:a aac')
            .save(outputPath)
            .on('end', () => {
              console.log('Combining video and audio finished');
  
              // Send the file for download
              res.download(outputPath, `${title}.mp4`, (err) => {
                if (err) {
                  console.error('Error sending file:', err);
                  res.status(500).json({ error: 'Error sending file' });
                } else {
                  console.log('Download sent successfully');
                  // Optionally, you can delete the output file after sending it
                  fs.unlink(outputPath, (err) => {
                    if (err) console.error('Error deleting output file:', err);
                  });
                  // Clean up temporary files
                  fs.unlink(videoPath, (err) => {
                    if (err) console.error('Error deleting video file:', err);
                  });
                  fs.unlink(audioPath, (err) => {
                    if (err) console.error('Error deleting audio file:', err);
                  });
                }
              });
            })
            .on('error', (err) => {
              console.error('Error combining video and audio:', err);
              res.status(500).json({ error: 'Error combining video and audio' });
            });
        });
  
        audioStream.on('error', (err) => {
          console.error('Error downloading audio:', err);
          res.status(500).json({ error: 'Error downloading audio' });
        });
      });
  
      videoStream.on('error', (err) => {
        console.error('Error downloading video:', err);
        res.status(500).json({ error: 'Error downloading video' });
      });
    } catch (error) {
      console.error('Error downloading video:', error);
      res.status(500).json({ error: 'Error downloading video' });
    }
  } else if(isTwitterUrl(url)) {
    res.status(500).json({ error: 'Not supported yet' });
  } else if(isRedditUrl(url)){
    try {
      const videoUrl = await getRedditVideoUrl(url);
      if (!videoUrl) {
        return res.status(404).json({ error: 'Video URL not found' });
      }

      const videoTitle = 'reddit_video';
      const videoPath = path.resolve(__dirname, `${videoTitle}.mp4`);

      const response = await axios({
        url: videoUrl,
        method: 'GET',
        responseType: 'stream',
      });

      response.data.pipe(fs.createWriteStream(videoPath))
        .on('finish', () => {
          console.log('Video downloaded successfully');
          res.download(videoPath, `${videoTitle}.mp4`, (err) => {
            if (err) {
              console.error('Error sending file:', err);
              res.status(500).json({ error: 'Error sending file' });
            } else {
              fs.unlink(videoPath, (err) => {
                if (err) console.error('Error deleting file:', err);
              });
            }
          });
        })
        .on('error', (err) => {
          console.error('Error downloading video:', err);
          res.status(500).json({ error: 'Error downloading video' });
        });

    } catch (error) {
      console.error('Error:', error.message);
      res.status(500).json({ error: 'Error downloading video' });
    }
  } else {
      try {
        const result = await alldl(url);
        const videoUrl = result.data.videoUrl;
        const videoTitle = result.data.title.replace(/[^a-zA-Z0-9]/g, '_'); // Sanitize title
        const videoPath = path.resolve(__dirname, `${videoTitle}.mp4`);

        // Download the video
        const response = await axios({
          url: videoUrl,
          method: 'GET',
          responseType: 'stream'
        });

        response.data.pipe(fs.createWriteStream(videoPath))
          .on('finish', () => {
            console.log('Video downloaded successfully');
            res.download(videoPath, `${videoTitle}.mp4`, (err) => {
              if (err) {
                console.error('Error sending file:', err);
                res.status(500).json({ error: 'Error sending file' });
              } else {
                // Optionally, you can delete the output file after sending it
                fs.unlink(videoPath, (err) => {
                  if (err) console.error('Error deleting file:', err);
                });
              }
            });
          })
          .on('error', (err) => {
            console.error('Error downloading video:', err);
            res.status(500).json({ error: 'Error downloading video' });
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
