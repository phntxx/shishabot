FROM node:current-alpine

WORKDIR /usr/src/app

COPY yarn.lock ./
COPY package.json ./

RUN [ "yarn", "install" ]

COPY src .
COPY data .

CMD [ "yarn", "start" ]