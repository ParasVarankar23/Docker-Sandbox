FROM node:20-alpine
RUN adduser -D sandbox
USER sandbox
WORKDIR /app
CMD ["node", "Main.js"]