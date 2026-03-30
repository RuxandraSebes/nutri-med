FROM node:20-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY . .
ENV PATIENT_SERVICE_PORT=3001
EXPOSE 3001
CMD ["node", "index.js"]

