FROM node:20-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY . .
ENV RECOMMENDATION_SERVICE_PORT=3003
EXPOSE 3003
CMD ["node", "index.js"]

