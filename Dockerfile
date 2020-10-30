FROM node:alpine

WORKDIR /app

COPY yarn.lock .
COPY package.json .

RUN [ "yarn", "install" ]

COPY index.js /app/index.js
COPY members.json /app/members.json

CMD [ "yarn", "start" ]

FROM node:current-alpine
