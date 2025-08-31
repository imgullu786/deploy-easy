#!/bin/bash

# AWS S3 Setup Script for Static Site Hosting
# Run this after configuring AWS CLI with your credentials

set -e

BUCKET_NAME=${1:-"deploy-app-gulamgaush"}
REGION=${2:-"ap-south-1"}

echo "🪣 Setting up S3 bucket for static site hosting..."

# Create S3 bucket
aws s3 mb s3://$BUCKET_NAME --region $REGION

# Configure bucket for static website hosting
aws s3 website s3://$BUCKET_NAME \
  --index-document index.html \
  --error-document error.html

# Set bucket policy for public read access
cat > bucket-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$BUCKET_NAME/*"
    }
  ]
}
EOF

aws s3api put-bucket-policy --bucket $BUCKET_NAME --policy file://bucket-policy.json

# Configure CORS
cat > cors-config.json << EOF
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedOrigins": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF

aws s3api put-bucket-cors --bucket $BUCKET_NAME --cors-configuration file://cors-config.json

# Clean up temp files
rm bucket-policy.json cors-config.json

echo "✅ S3 bucket setup complete!"
echo "Website URL: http://$BUCKET_NAME.s3.$REGION.amazonaws.com"
echo ""
echo "Add these environment variables to your backend .env:"
echo "S3_BUCKET_NAME=$BUCKET_NAME"
echo "AWS_REGION=$REGION"