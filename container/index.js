import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import * as fs from "node:fs/promises";
import * as fsOld from "node:fs";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";
import dotenv from "dotenv";
dotenv.config();

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

//.ENV
const BUCKET_NAME = process.env.BUCKET_NAME;
const KEY = process.env.KEY;

// Download the raw video
async function init() {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: KEY,
  });

  const result = await s3Client.send(command);
  const originalFilePath = `original-video.mp4`;
  await fs.writeFile(originalFilePath, result.Body);

  const originalVideoPath = path.resolve(originalFilePath);

  // Start the transcoder
  const RESOLUTIONS = [
    { name: "360p", width: 480, height: 360 },
    { name: "480p", width: 858, height: 480 },
  ];

  const promises = RESOLUTIONS.map((resolution) => {
    const output = `video-${resolution.name}.mp4`;

    return new Promise((resolve) => {
      ffmpeg(originalVideoPath)
        .output(output)
        .withVideoCodec("libx264")
        .withAudioCodec("aac")
        .withSize(`${resolution.width}x${resolution.height}`)
        .on("start", () =>
          console.log("Start", `${resolution.width}x${resolution.height}`)
        )
        .on("end", async () => {
          // Upload the video
          const putCommand = new PutObjectCommand({
            Bucket: process.env.OUTPUT_BUCKET_NAME,
            Key: output,
            Body: fsOld.createReadStream(path.resolve(output)),
          });
          await s3Client.send(putCommand);
          console.log(`uploaded: ${output}`);
          resolve();
        })
        .format("mp4")
        .run();
    });
  });
  await Promise.all(promises);
}

init();
