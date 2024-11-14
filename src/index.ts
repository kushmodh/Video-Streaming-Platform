import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";
import { S3Event } from "aws-lambda";

import dotenv from "dotenv";
dotenv.config();

const client = new SQSClient({
  region: process.env.AWS_REGION || "",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const ecsClient = new ECSClient({
  region: process.env.AWS_REGION || "",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

async function init() {
  const command = new ReceiveMessageCommand({
    QueueUrl: process.env.QUEUE_URL,
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 20,
  });

  while (true) {
    const { Messages } = await client.send(command);
    if (!Messages) {
      console.log(`No Message in Queue`);
      continue;
    }

    try {
      for (const message of Messages) {
        const { MessageId, Body } = message;
        console.log(`Message Recieved`, { MessageId, Body });
        if (!Body) continue;

        // Validate and parse the event
        const event = JSON.parse(Body) as S3Event;

        // Ignore the test event
        if ("Service" in event && "Event" in event) {
          if (event.Event === "s3.TestEvent") {
            await client.send(
              new DeleteMessageCommand({
                QueueUrl: process.env.QUEUE_URL,
                ReceiptHandle: message.ReceiptHandle,
              })
            );
            continue;
          }
        }

        for (const record of event.Records) {
          const { s3 } = record;
          const {
            bucket,
            object: { key },
          } = s3;

          // Spin the docker container
          const runTaskCommand = new RunTaskCommand({
            taskDefinition:
              "arn:aws:ecs:ap-south-1:691654398267:task-definition/video-transcoder",
            cluster: "arn:aws:ecs:ap-south-1:691654398267:cluster/Dev1",
            launchType: "FARGATE",
            networkConfiguration: {
              awsvpcConfiguration: {
                subnets: [
                  "subnet-00137574823b1705c",
                  "subnet-07f46dacbeee83091",
                  "subnet-0e9adb0308332f3dc",
                ],
                securityGroups: ["sg-0957a759a1f5df0d2"],
                assignPublicIp: "ENABLED",
              },
            },
            overrides: {
              containerOverrides: [
                {
                  name: "video-transcoder", // Name of the container to override
                  environment: [
                    {
                      name: "BUCKET_NAME", // Environment variable name
                      value: bucket.name, // Environment variable value
                    },
                    {
                      name: "KEY",
                      value: key,
                    },
                  ],
                },
              ],
            },
          });

          await ecsClient.send(runTaskCommand);

          // Delete message from queue
          await client.send(
            new DeleteMessageCommand({
              QueueUrl: process.env.QUEUE_URL,
              ReceiptHandle: message.ReceiptHandle,
            })
          );
        }
      }
    } catch (error) {
      console.log(error);
    }
  }
}

init();
