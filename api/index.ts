const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const tmp = require('tmp');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const youtubedl = require('youtube-dl-exec');
const https = require('https');
const getFBInfo  = require('@xaviabot/fb-downloader');

const Tiktok = require('@tobyg74/tiktok-api-dl');
const instagramGetUrl = require('instagram-url-direct');
const tt = require('twitter-dl');

const app = express();

const privateKey = fs.readFileSync('/home/opc/certs/server.key', 'utf8');
const certificate = fs.readFileSync('/home/opc/certs/server.cert', 'utf8');
const credentials = { key: privateKey, cert: certificate };

app.use(cors());
app.use(bodyParser.json());

const isYoutubeUrl = (url) => {
  const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
  return regex.test(url);
};

const isTwitterUrl = (url) => {
  const regex = /https?:\/\/(www\.)?twitter\.com\/[A-Za-z0-9_]+\/status\/\d+/;
  return regex.test(url);
};

const isRedditUrl = (url) => {
  const regex = /^(https?:\/\/)?(www\.)?(reddit\.[a-zA-Z]{2,}|redd\.it)\/.+$/;
  return regex.test(url);
};

const isTikTokUrl = (url) => {
  const regex = /^.*https:\/\/(?:m|www|vm)?\.?tiktok\.com\/((?:.*\b(?:(?:usr|v|embed|user|video)\/|\?shareId=|\&item_id=)(\d+))|\w+)/;
  return regex.test(url);
};

const isFacebookUrl = (url) => {
  const regex = /^(https?:\/\/)?(www\.)?facebook\.com\/.+$/;
  return regex.test(url);
};

const isInstagramUrl = (url) => {
  const regex = /^(https?:\/\/)?(www\.)?instagram\.com\/.+$/;
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

const getFacebookVideoUrl = async (url) => {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
      }
    });

    const videoUrlMatch = response.data.match(/"hd_src":"(https:[^"]+)"/);
    if (videoUrlMatch && videoUrlMatch[1]) {
      return videoUrlMatch[1].replace(/\\u0025/g, '%').replace(/\\/g, '');
    } else {
      const videoUrlMatchSD = response.data.match(/"sd_src":"(https:[^"]+)"/);
      if (videoUrlMatchSD && videoUrlMatchSD[1]) {
        return videoUrlMatchSD[1].replace(/\\u0025/g, '%').replace(/\\/g, '');
      }
    }
    return null;
  } catch (error) {
    console.error('Error fetching Facebook video URL:', error);
    return null;
  }
};

const getLongUrl = async (url) => {
  try {
    const response = await axios.get(url, {
      maxRedirects: 0,
      validateStatus: (status) => status === 302 || status === 301
    });
    return response.headers.location;
  } catch (error) {
    if (error.response && error.response.status === 302) {
      return error.response.headers.location;
    }
    console.error('Error fetching long  URL:', error);
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
      youtubedl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: ['referer:youtube.com', 'user-agent:googlebot']
      }).then(async (output) => {
        const videoTmp = tmp.fileSync({ postfix: '.mp4' });
        const response = await axios({
          url: output.url,
          method: 'GET',
          responseType: 'stream',
        });
        response.data.pipe(fs.createWriteStream(videoTmp.name))
        .on('finish', () => {
          console.log('Video downloaded successfully');
          res.download(videoTmp.name, `youtube_video.mp4`, (err) => {
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
          // Clean up temporary files in case of error
          videoTmp.removeCallback();
        });
      });
    } catch (error) {
      console.error('Error downloading video:', error);
      res.status(500).json({ error: 'Error downloading video' });
    }
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
      let videoUrl;

      if (isTikTokUrl(url)) {
        const longUrl = await getLongUrl(url);
        const result = await Tiktok.Downloader(longUrl, { version: 'v1' });
        videoUrl = result.result.video.downloadAddr;
      } else if (isFacebookUrl(url)) {
        videoUrl = await getFBInfo(url)
        .then((result) => result.hd || result.sd)
        .catch((error) => {
          console.error('Error fetching Facebook video URL:', error);
          res.status(500).json({ error: 'Error fetching Facebook video URL' });
          return;
        });        
      } else if (isInstagramUrl(url)) {
        videoUrl = await instagramGetUrl(url).then(result => result.url_list[0]);
      } else if (isTwitterUrl(url)) {
        return res.status(400).json({ error: 'Unsupported URL' });
      } else {
        return res.status(400).json({ error: 'Unsupported URL' });
      }
  
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

app.post('/check', async (req, res) => {
  res.send('Hello World!')
})