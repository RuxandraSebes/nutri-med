FROM node:20-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY . .
ENV AUTH_SERVICE_PORT=3010
EXPOSE 3010
CMD ["node", "index.js"]
