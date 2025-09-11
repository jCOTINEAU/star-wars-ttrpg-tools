FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production --no-audit --no-fund
COPY . .
EXPOSE 3010
ENV PORT=3010
CMD ["npm","start"]
