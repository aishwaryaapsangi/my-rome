FROM node:22-alpine
WORKDIR /app
COPY api-worker/src/ ./api-worker/src/
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "api-worker/src/http-server.mjs"]
