FROM alpine:3.10

RUN apk update
RUN apk --no-cache add git

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]