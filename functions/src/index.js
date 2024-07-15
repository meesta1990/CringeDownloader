var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _this = this;
var express = require('express');
var cors = require('cors');
var bodyParser = require('body-parser');
var admin = require('firebase-admin');
var ytdl = require('@distube/ytdl-core');
var axios = require('axios');
var PassThrough = require('stream').PassThrough;
var path = require('path');
var ffmpeg = require('fluent-ffmpeg');
var ffmpegPath = require('ffmpeg-static');
var Writable = require('stream').Writable;
var alldl = require('rahad-all-downloader').alldl;
var twitterdown = require("nayan-media-downloader").twitterdown;
// Configura ffmpeg-static come percorso ffmpeg per fluent-ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);
// Inizializza l'app Firebase Admin SDK
var serviceAccount = require(path.resolve('./firebase-key.json'));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'cringedownloader.appspot.com' // Sostituisci con il nome del tuo bucket Firebase Storage
});
var bucket = admin.storage().bucket();
var app = express();
// Configurazione delle opzioni CORS
var corsOptions = {
    origin: true,
    methods: ['POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200 // Alcuni browser (come IE11) utilizzano 204 come risposta predefinita per successStatus
};
app.use(cors(corsOptions));
app.use(bodyParser.json());
// Funzione per verificare se l'URL è di YouTube
var isYoutubeUrl = function (url) {
    var regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
    return regex.test(url);
};
var isTwitterUrl = function (url) {
    var regex = /[(?:https?:\/\/(?:twitter|x)\.com)](\/(?:#!\/)?(\w+)\/status(es)?\/(\d+))/;
    return regex.test(url);
};
// Funzione per caricare un buffer su Firebase Storage e ottenere l'URL
var uploadBufferToFirebaseStorage = function (buffer, filename) {
    var file = bucket.file(filename);
    return new Promise(function (resolve, reject) {
        var stream = file.createWriteStream();
        stream.on('finish', function () { return __awaiter(_this, void 0, void 0, function () {
            var url;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, file.getSignedUrl({
                            action: 'read',
                            expires: '03-17-2025' // Sostituisci con la data di scadenza desiderata
                        })];
                    case 1:
                        url = (_a.sent())[0];
                        console.log("File uploaded to Firebase Storage: ".concat(filename));
                        resolve(url);
                        return [2 /*return*/];
                }
            });
        }); }).on('error', function (err) {
            console.error("Error uploading buffer to Firebase Storage: ".concat(filename), err);
            reject(err);
        });
        stream.end(buffer);
    });
};
// Funzione per combinare video e audio con ffmpeg utilizzando URL e buffer in memoria
var combineVideoAudio = function (videoUrl, audioUrl, outputFilename) {
    return new Promise(function (resolve, reject) {
        var buffers = [];
        var writableStream = new Writable({
            write: function (chunk, encoding, callback) {
                buffers.push(chunk);
                callback();
            }
        });
        var command = ffmpeg()
            .input(videoUrl)
            .input(audioUrl)
            .outputOptions('-c:v copy')
            .outputOptions('-c:a aac')
            .outputOptions('-movflags frag_keyframe+empty_moov')
            .format('mp4')
            .on('start', function (cmd) {
            console.log("Started ffmpeg with command: ".concat(cmd));
        })
            .on('stderr', function (stderrLine) {
            console.log('ffmpeg stderr:', stderrLine);
        })
            .on('error', function (err, stdout, stderr) {
            if (err) {
                console.log(err.message);
                console.log("stdout:\n" + stdout);
                console.log("stderr:\n" + stderr);
                reject("Error");
            }
        })
            .on('end', function () { return __awaiter(_this, void 0, void 0, function () {
            var buffer, url;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        buffer = Buffer.concat(buffers);
                        return [4 /*yield*/, uploadBufferToFirebaseStorage(buffer, outputFilename)];
                    case 1:
                        url = _a.sent();
                        console.log("File combined and uploaded to Firebase Storage: ".concat(outputFilename));
                        resolve(url);
                        return [2 /*return*/];
                }
            });
        }); });
        command.pipe(writableStream);
    });
};
// Rotta per il download
app.post('/download', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
    var url, info, title_1, videoStream, audioStream, videoUrl, _a, audioUrl, _b, combinedUrl, error_1, result, videoUrl, videoTitle_1, response, videoStream, videoBuffer, videoUploadUrl, error_2, URL_1, data, videoTitle;
    var _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                url = req.body.url;
                if (!url) {
                    return [2 /*return*/, res.status(400).json({ error: 'URL is required' })];
                }
                if (!isYoutubeUrl(url)) return [3 /*break*/, 10];
                _d.label = 1;
            case 1:
                _d.trys.push([1, 8, , 9]);
                return [4 /*yield*/, ytdl.getInfo(url)];
            case 2:
                info = _d.sent();
                title_1 = info.videoDetails.title.replace(/[^a-zA-Z0-9]/g, '_') + '_' + new Date().getTime();
                videoStream = ytdl(url, { filter: 'videoonly' });
                audioStream = ytdl(url, { filter: 'audioonly' });
                _a = uploadBufferToFirebaseStorage;
                return [4 /*yield*/, streamToBuffer(videoStream)];
            case 3: return [4 /*yield*/, _a.apply(void 0, [_d.sent(), "".concat(title_1, "_video.mp4")])];
            case 4:
                videoUrl = _d.sent();
                _b = uploadBufferToFirebaseStorage;
                return [4 /*yield*/, streamToBuffer(audioStream)];
            case 5: return [4 /*yield*/, _b.apply(void 0, [_d.sent(), "".concat(title_1, "_audio.mp4")])];
            case 6:
                audioUrl = _d.sent();
                return [4 /*yield*/, combineVideoAudio(videoUrl, audioUrl, "".concat(title_1, ".mp4"))];
            case 7:
                combinedUrl = _d.sent();
                res.setHeader('Content-Disposition', "attachment; filename=\"".concat(title_1, ".mp4\""));
                axios({
                    url: combinedUrl,
                    method: 'GET',
                    responseType: 'stream'
                }).then(function (response) {
                    response.data.pipe(res);
                }).catch(function (err) {
                    console.error('Error downloading combined video:', err);
                    res.status(500).json({ error: 'Error downloading combined video' });
                });
                // Pulizia del file temporaneo dal bucket dopo un certo tempo
                setTimeout(function () {
                    bucket.file("".concat(title_1, "_video.mp4")).delete().catch(function (err) { return console.error('Error deleting video file from bucket:', err); });
                    bucket.file("".concat(title_1, "_audio.mp4")).delete().catch(function (err) { return console.error('Error deleting audio file from bucket:', err); });
                    bucket.file("".concat(title_1, ".mp4")).delete().catch(function (err) { return console.error('Error deleting combined file from bucket:', err); });
                }, 60000); // Elimina i file dopo 1 minuto
                return [3 /*break*/, 9];
            case 8:
                error_1 = _d.sent();
                console.error('Error processing video:', error_1);
                res.status(500).json({ error: 'Error processing video' });
                return [3 /*break*/, 9];
            case 9: return [3 /*break*/, 22];
            case 10:
                if (!!isTwitterUrl(url)) return [3 /*break*/, 20];
                _d.label = 11;
            case 11:
                _d.trys.push([11, 18, , 19]);
                return [4 /*yield*/, alldl(url)];
            case 12:
                result = _d.sent();
                if (!result.success) return [3 /*break*/, 16];
                videoUrl = result.data.videoUrl;
                videoTitle_1 = result.data.title.replace(/[^a-zA-Z0-9]/g, '_') + '_' + new Date().getTime();
                return [4 /*yield*/, axios({
                        url: videoUrl,
                        method: 'GET',
                        responseType: 'stream'
                    })];
            case 13:
                response = _d.sent();
                videoStream = response.data;
                return [4 /*yield*/, streamToBuffer(videoStream)];
            case 14:
                videoBuffer = _d.sent();
                return [4 /*yield*/, uploadBufferToFirebaseStorage(videoBuffer, "".concat(videoTitle_1, ".mp4"))];
            case 15:
                videoUploadUrl = _d.sent();
                res.setHeader('Content-Disposition', "attachment; filename=\"".concat(videoTitle_1, ".mp4\""));
                axios({
                    url: videoUploadUrl,
                    method: 'GET',
                    responseType: 'stream'
                }).then(function (response) {
                    response.data.pipe(res);
                }).catch(function (err) {
                    console.error('Error downloading video:', err);
                    res.status(500).json({ error: 'Error downloading video' });
                });
                // Pulizia del file temporaneo dal bucket dopo un certo tempo
                setTimeout(function () {
                    bucket.file("".concat(videoTitle_1, ".mp4")).delete().catch(function (err) { return console.error('Error deleting file from bucket:', err); });
                }, 60000); // Elimina i file dopo 1 minuto
                return [3 /*break*/, 17];
            case 16:
                res.status(500).json({ error: 'Error downloading video,' + result.data.error });
                _d.label = 17;
            case 17: return [3 /*break*/, 19];
            case 18:
                error_2 = _d.sent();
                console.error('Error:', error_2.message);
                res.status(500).json({ error: 'Error downloading video' });
                return [3 /*break*/, 19];
            case 19: return [3 /*break*/, 22];
            case 20: return [4 /*yield*/, twitterdown(url)];
            case 21:
                URL_1 = _d.sent();
                if (URL_1.status) {
                    data = (_c = URL_1.data.HD) !== null && _c !== void 0 ? _c : URL_1.data.SD;
                    videoTitle = "twitter_video_".concat(new Date().getTime(), ".mp4");
                    res.setHeader('Content-Disposition', "attachment; filename=\"".concat(videoTitle, ".mp4\""));
                    axios({
                        url: data,
                        method: 'GET',
                        responseType: 'stream'
                    }).then(function (response) {
                        response.data.pipe(res);
                    }).catch(function (err) {
                        console.error('Error downloading video:', err);
                        res.status(500).json({ error: 'Error downloading video' });
                    });
                }
                else {
                    res.status(500).json({ error: 'Error downloading video' });
                }
                _d.label = 22;
            case 22: return [2 /*return*/];
        }
    });
}); });
// Funzione per convertire uno stream in un buffer
var streamToBuffer = function (stream) {
    return new Promise(function (resolve, reject) {
        var buffers = [];
        stream.on('data', function (chunk) { return buffers.push(chunk); });
        stream.on('end', function () { return resolve(Buffer.concat(buffers)); });
        stream.on('error', reject);
    });
};
app.listen(3000, function () {
    console.log("Example app listening on port 3000");
});
