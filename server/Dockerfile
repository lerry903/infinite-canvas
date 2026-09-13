FROM oven/bun:1.3.13
WORKDIR /app
COPY package.json ./
COPY index.ts ./
RUN mkdir -p /data
EXPOSE 8787
CMD ["bun", "run", "index.ts"]
