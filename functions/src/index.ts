const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const ytdl = require('@distube/ytdl-core');
const axios = require('axios');
const { PassThrough } = require('stream');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { Writable } = require('stream');
const { alldl } = require('rahad-all-downloader');
const { twitterdown } = require("nayan-media-downloader")
const { onRequest } = require("firebase-functions/v2/https");

// Configura ffmpeg-static come percorso ffmpeg per fluent-ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

// Inizializza l'app Firebase Admin SDK
const serviceAccount = require(path.resolve('./firebase-key.json'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'cringedownloader.appspot.com' // Sostituisci con il nome del tuo bucket Firebase Storage
});

const bucket = admin.storage().bucket();
const app = express();

// Configurazione delle opzioni CORS
const corsOptions = {
    origin: true,
    methods: ['POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200 // Alcuni browser (come IE11) utilizzano 204 come risposta predefinita per successStatus
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

// Funzione per verificare se l'URL è di YouTube
const isYoutubeUrl = (url: string) => {
    const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
    return regex.test(url);
};

const isTwitterUrl = (url: string) => {
    const regex = /[(?:https?:\/\/(?:twitter|x)\.com)](\/(?:#!\/)?(\w+)\/status(es)?\/(\d+))/;
    return regex.test(url);
};

// Funzione per caricare un buffer su Firebase Storage e ottenere l'URL
const uploadBufferToFirebaseStorage = (buffer: any, filename: string) => {
    const file = bucket.file(filename);

    return new Promise((resolve, reject) => {
        const stream = file.createWriteStream();
        stream.on('finish', async () => {
            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: '03-17-2025' // Sostituisci con la data di scadenza desiderata
            });
            console.log(`File uploaded to Firebase Storage: ${filename}`);
            resolve(url);
        }).on('error', (err: any) => {
            console.error(`Error uploading buffer to Firebase Storage: ${filename}`, err);
            reject(err);
        });

        stream.end(buffer);
    });
};

// Funzione per combinare video e audio con ffmpeg utilizzando URL e buffer in memoria
const combineVideoAudio = (videoUrl: any, audioUrl: any, outputFilename: any) => {
    return new Promise((resolve, reject) => {
        const buffers: any = [];
        const writableStream = new Writable({
            write(chunk: any, encoding: any, callback: any) {
                buffers.push(chunk);
                callback();
            }
        });

        const command = ffmpeg()
            .input(videoUrl)
            .input(audioUrl)
            .outputOptions('-c:v copy')
            .outputOptions('-c:a aac')
            .outputOptions('-movflags frag_keyframe+empty_moov')
            .format('mp4')
            .on('start', (cmd: any) => {
                console.log(`Started ffmpeg with command: ${cmd}`);
            })
            .on('stderr', (stderrLine: any) => {
                console.log('ffmpeg stderr:', stderrLine);
            })
            .on('error', function(err: any, stdout: any, stderr: any) {
                if (err) {
                    console.log(err.message);
                    console.log("stdout:\n" + stdout);
                    console.log("stderr:\n" + stderr);
                    reject("Error");
                }
            })
            .on('end', async () => {
                const buffer = Buffer.concat(buffers);
                const url = await uploadBufferToFirebaseStorage(buffer, outputFilename);
                console.log(`File combined and uploaded to Firebase Storage: ${outputFilename}`);
                resolve(url);
            });

        command.pipe(writableStream);
    });
};

// Funzione per convertire uno stream in un buffer
const streamToBuffer = (stream: any) => {
    return new Promise((resolve, reject) => {
        const buffers: any = [];
        stream.on('data', (chunk: any) => buffers.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(buffers)));
        stream.on('error', reject);
    });
};

exports.download = onRequest(
    { cors: true },
    async(req: any, res: any) => {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
    
        if (isYoutubeUrl(url)) {
            try {
                const info = await ytdl.getInfo(url);
                const title = info.videoDetails.title.replace(/[^a-zA-Z0-9]/g, '_') + '_' + new Date().getTime(); // Sanitize title
    
                const videoStream = ytdl(url, { filter: 'videoonly' });
                const audioStream = ytdl(url, { filter: 'audioonly' });
    
                // Carica video e audio su Firebase Storage
                const videoUrl = await uploadBufferToFirebaseStorage(await streamToBuffer(videoStream), `${title}_video.mp4`);
                const audioUrl = await uploadBufferToFirebaseStorage(await streamToBuffer(audioStream), `${title}_audio.mp4`);
    
                // Combina video e audio con ffmpeg e carica il risultato su Firebase Storage
                const combinedUrl = await combineVideoAudio(videoUrl, audioUrl, `${title}.mp4`);
    
                res.setHeader('Content-Disposition', `attachment; filename="${title}.mp4"`);
                axios({
                    url: combinedUrl,
                    method: 'GET',
                    responseType: 'stream'
                }).then((response: any) => {
                    response.data.pipe(res);
                }).catch((err: any) => {
                    console.error('Error downloading combined video:', err);
                    res.status(500).json({ error: 'Error downloading combined video:' + JSON.stringify(err) });
                });
    
                // Pulizia del file temporaneo dal bucket dopo un certo tempo
                setTimeout(() => {
                    bucket.file(`${title}_video.mp4`).delete().catch((err: any) => console.error('Error deleting video file from bucket:', err));
                    bucket.file(`${title}_audio.mp4`).delete().catch((err: any) => console.error('Error deleting audio file from bucket:', err));
                    bucket.file(`${title}.mp4`).delete().catch((err: any) => console.error('Error deleting combined file from bucket:', err));
                }, 60000); // Elimina i file dopo 1 minuto
    
            } catch (error) {
                console.error('Error processing video:', error);
                res.status(500).json({ error: 'Error processing video' });
            }
        } else if(!isTwitterUrl(url)) {
            try {
                const result = await alldl(url)
                const videoUrl = result.data.videoUrl;
                const videoTitle = result.data.title.replace(/[^a-zA-Z0-9]/g, '_') + '_' + new Date().getTime(); // Sanitize title
    
                const response = await axios({
                    url: videoUrl,
                    method: 'GET',
                    responseType: 'stream'
                });
    
                const videoStream = response.data;
                const videoBuffer = await streamToBuffer(videoStream);
                const videoUploadUrl = await uploadBufferToFirebaseStorage(videoBuffer, `${videoTitle}.mp4`);
    
                res.setHeader('Content-Disposition', `attachment; filename="${videoTitle}.mp4"`);
                axios({
                    url: videoUploadUrl,
                    method: 'GET',
                    responseType: 'stream'
                }).then((response: any) => {
                    response.data.pipe(res);
                }).catch((err: any) => {
                    console.error('Error downloading video:', err);
                    res.status(500).json({ error: 'Error downloading video' });
                });
    
                // Pulizia del file temporaneo dal bucket dopo un certo tempo
                setTimeout(() => {
                    bucket.file(`${videoTitle}.mp4`).delete().catch((err: any) => console.error('Error deleting file from bucket:', err));
                }, 60000); // Elimina i file dopo 1 minuto
            } catch (error: any) {
                console.error('Error:', error.message);
                res.status(500).json({ error: 'Error downloading video, ' + error.message });
            }
        } else {
            //twitter
            let URL = await twitterdown(url)
            if(URL.status) {
                const data = URL.data.HD ?? URL.data.SD
                const videoTitle = `twitter_video_${new Date().getTime()}.mp4`; // Nome del file desiderato
                console.log(data)
                res.setHeader('Content-Disposition', `attachment; filename="${videoTitle}.mp4"`);
                axios({
                    url: data,
                    method: 'GET',
                    responseType: 'stream'
                }).then((response: any) => {
                    response.data.pipe(res);
                }).catch((err: any) => {
                    console.error('Error downloading video:', err);
                    res.status(500).json({ error: 'Error downloading video' });
                });
            } else{
                res.status(500).json({ error: 'Error downloading video' });
            }
            
        }
    }
);