#!/bin/bash

# EC2 Setup Script for DeployFlow
# Run this on a fresh Ubuntu 20.04+ EC2 instance

set -e

echo "🚀 Setting up DeployFlow on EC2..."

# Update system
sudo apt-get update -y
sudo apt-get upgrade -y

# Install Docker
echo "📦 Installing Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Node.js
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Nginx
echo "📦 Installing Nginx..."
sudo apt-get install -y nginx

# Install Git
sudo apt-get install -y git

# Create application directory
sudo mkdir -p /opt/deployflow
sudo chown ubuntu:ubuntu /opt/deployflow

# Create Docker network for deployments
docker network create deployflow-network || true

# Setup log directories
sudo mkdir -p /var/log/deployflow
sudo chown ubuntu:ubuntu /var/log/deployflow

# Configure firewall
echo "🔒 Configuring firewall..."
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw allow 5000
echo "y" | sudo ufw enable

# Install MongoDB
echo "📦 Installing MongoDB..."
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# Setup SSL certificate directory
sudo mkdir -p /etc/nginx/ssl
sudo chown -R ubuntu:ubuntu /etc/nginx/ssl

echo "✅ EC2 setup complete!"
echo ""
echo "Next steps:"
echo "1. Configure your domain DNS to point to this EC2 instance"
echo "2. Set up SSL certificates in /etc/nginx/ssl/"
echo "3. Update the environment variables in your deployment"
echo "4. Configure AWS credentials for S3 access"
echo ""
echo "Instance IP: $(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"