const express = require('express');
const ytdl = require('@distube/ytdl-core');
const cors = require('cors');
const bodyParser = require('body-parser');
const tmp = require('tmp');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { alldl } = require('rahad-all-downloader');
const youtubedl = require('youtube-dl-exec')

const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());

const isYoutubeUrl = (url: string) => {
  const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
  return regex.test(url);
};

const isTwitterUrl = (url: string) => {
  const regex = /[(?:https?:\/\/(?:twitter|x)\.com)](\/(?:#!\/)?(\w+)\/status(es)?\/(\d+))/;
  return regex.test(url);
};

const isRedditUrl = (url: string) => {
  const regex = /^(https?:\/\/)?(www\.)?(reddit\.[a-zA-Z]{2,}|redd\.it)\/.+$/;
  return regex.test(url);
};

const getRedditVideoUrl = async (url: string) => {
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

app.post('/api/download', async (req: any, res: any) => {
  let { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  if (isYoutubeUrl(url)) {
    try {
      youtubedl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: ['referer:youtube.com', 'user-agent:googlebot']
      }).then(async (output: any) => {
        const videoTmp = tmp.fileSync({ postfix: '.mp4' });
        const response = await axios({
          url: output.url,
          method: 'GET',
          responseType: 'stream',
        });

        response.data.pipe(fs.createWriteStream(videoTmp.name))
          .on('finish', () => {
            console.log('Video downloaded successfully');
            res.download(videoTmp.name, `youtube_video.mp4`, (err: any) => {
              if (err) {
                console.error('Error sending file:', err);
                res.status(500).json({ error: 'Error sending file' });
              } else {
                videoTmp.removeCallback();
              }
            });
          })
          .on('error', (err: any) => {
            console.error('Error downloading video:', err);
            res.status(500).json({ error: 'Error downloading video' });
            videoTmp.removeCallback();
          });
      })
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
          res.download(videoTmp.name, `reddit_video.mp4`, (err: any) => {
            if (err) {
              console.error('Error sending file:', err);
              res.status(500).json({ error: 'Error sending file' });
            } else {
              videoTmp.removeCallback();
            }
          });
        })
        .on('error', (err: any) => {
          console.error('Error downloading video:', err);
          res.status(500).json({ error: 'Error downloading video' });
          videoTmp.removeCallback();
        });

    } catch (error: any) {
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
          res.download(videoTmp.name, `video.mp4`, (err: any) => {
            if (err) {
              console.error('Error sending file:', err);
              res.status(500).json({ error: 'Error sending file' });
            } else {
              videoTmp.removeCallback();
            }
          });
        })
        .on('error', (err: any) => {
          console.error('Error downloading video:', err);
          res.status(500).json({ error: 'Error downloading video' });
          videoTmp.removeCallback();
        });

    } catch (error: any) {
      console.error('Error:', error.message);
      res.status(500).json({ error: 'Error downloading video' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
