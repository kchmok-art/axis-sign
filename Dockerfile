FROM node:24-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY public ./public
ENV PORT=3001 DATA_DIR=/data
EXPOSE 3001
USER node
CMD ["node","server.js"]
