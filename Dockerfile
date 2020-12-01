FROM node:current-alpine

WORKDIR /usr/src/app/bot

COPY src/yarn.lock ./
COPY src/package.json ./

RUN [ "yarn", "install" ]

COPY src/index.js ./

CMD [ "yarn", "start" ]