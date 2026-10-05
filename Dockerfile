FROM node:22-alpine
WORKDIR /app
COPY package.json server.js training.js personal-access.js ./
COPY public ./public
COPY tests ./tests
COPY scripts ./scripts
RUN npm run check
RUN mkdir -p /app/data
ENV PORT=3000 DATA_DIR=/app/data NODE_ENV=production
EXPOSE 3000
CMD ["node", "--experimental-sqlite", "server.js"]
