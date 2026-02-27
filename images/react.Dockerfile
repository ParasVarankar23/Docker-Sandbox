FROM node:20-alpine
RUN adduser -D sandbox
USER sandbox
WORKDIR /app
CMD ["sh", "-c", "npm install && npm run build"]