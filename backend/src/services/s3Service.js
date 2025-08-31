import mime from "mime-types";
import dotenv from "dotenv";
dotenv.config();

import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { promises as fs } from "fs";
import path from "path";

class S3Service {
  constructor() {
    this.s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    this.bucketName = process.env.S3_BUCKET_NAME;
    console.log("S3 Bucket Name:", this.bucketName);
    console.log("AWS Region:", process.env.AWS_REGION);
  }

  // Upload a static site
  async uploadStaticSite(distPath, s3Path) {
    try {
      await this.uploadDirectory(distPath, s3Path);
      return `https://${this.bucketName}.gulamgaush.in`;
    } catch (error) {
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  // Upload directory recursively
  async uploadDirectory(localPath, s3Path) {
    const files = await this.getFilesRecursively(localPath);

    const uploadPromises = files.map(async (file) => {
      const relativePath = path.relative(localPath, file);
      const s3Key = path.join(s3Path, relativePath).replace(/\\/g, "/");

      const fileContent = await fs.readFile(file);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: fileContent,
        ContentType: mime.lookup(file)
      });

      return this.s3.send(command);
    });

    await Promise.all(uploadPromises);
  }

  // Recursively get all files
  async getFilesRecursively(dir) {
    const files = [];
    const items = await fs.readdir(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        files.push(...(await this.getFilesRecursively(fullPath)));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  // Delete files from S3
  async deleteFiles(s3Path) {
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: s3Path,
      });

      const objects = await this.s3.send(listCommand);

      if (objects.Contents?.length > 0) {
        const deleteParams = {
          Bucket: this.bucketName,
          Delete: {
            Objects: objects.Contents.map((obj) => ({ Key: obj.Key })),
          },
        };

        const deleteCommand = new DeleteObjectsCommand(deleteParams);
        await this.s3.send(deleteCommand);
      }
    } catch (error) {
      console.error("Failed to delete S3 files:", error);
    }
  }
}

export const s3Service = new S3Service();
