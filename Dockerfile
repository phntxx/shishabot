FROM node:alpine

WORKDIR /app

COPY yarn.lock .
COPY package.json .

RUN [ "npm", "install" ]

COPY . /app

CMD [ "npm", "start" ]
