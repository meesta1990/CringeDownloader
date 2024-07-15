const express = require('express');

const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const PORT = 5000;
const youtubeModule = require('./services/youtube.ts')
const { alldl } = require('rahad-all-downloader');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

app.use(cors());
app.use(bodyParser.json());

const isYoutubeUrl = (url) => {
  const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
  return regex.test(url);
};

app.post('/download', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  if(isYoutubeUrl(url)) {
    youtubeModule.download(res, url)
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
