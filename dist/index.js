"use strict";
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
Object.defineProperty(exports, "__esModule", { value: true });
const client_sqs_1 = require("@aws-sdk/client-sqs");
const client_ecs_1 = require("@aws-sdk/client-ecs");
const client = new client_sqs_1.SQSClient({
  region: "",
  credentials: {
    credentials: {
      accessKeyId: "",
      secretAccessKey: "",
    },
  },
});
const ecsClient = new client_ecs_1.ECSClient({
  region: "",
  credentials: {
    accessKeyId: "",
    secretAccessKey: "",
  },
});
function init() {
  return __awaiter(this, void 0, void 0, function* () {
    const command = new client_sqs_1.ReceiveMessageCommand({
      QueueUrl:
        "https://sqs.ap-south-1.amazonaws.com/691654398267/gautammanocha22112001-raw-video-queue",
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 20,
    });
    while (true) {
      const { Messages } = yield client.send(command);
      if (!Messages) {
        console.log(`No Message in Queue`);
        continue;
      }
      try {
        for (const message of Messages) {
          const { MessageId, Body } = message;
          console.log(`Message Recieved`, { MessageId, Body });
          if (!Body) continue;
          //validate and parse the event
          const event = JSON.parse(Body);
          //Ignore the test event
          if ("Service" in event && "Event" in event) {
            if (event.Event === "s3.TestEvent") {
              yield client.send(
                new client_sqs_1.DeleteMessageCommand({
                  QueueUrl:
                    "https://sqs.ap-south-1.amazonaws.com/691654398267/gautammanocha22112001-raw-video-queue",
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
            //Spin the docker container
            const runTaskCommand = new client_ecs_1.RunTaskCommand({
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
            yield ecsClient.send(runTaskCommand);
            //Delete message from queue
            yield client.send(
              new client_sqs_1.DeleteMessageCommand({
                QueueUrl:
                  "https://sqs.ap-south-1.amazonaws.com/691654398267/gautammanocha22112001-raw-video-queue",
                ReceiptHandle: message.ReceiptHandle,
              })
            );
          }
        }
      } catch (error) {
        console.log(error);
      }
    }
  });
}
init();
