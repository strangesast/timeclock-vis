FROM mariadb
VOLUME dump.sql:/docker-entrypoint-initdb.d/dump.sql
VOLUME custom.cnf:/etc/mysql/conf.d/custom.cnf
ENV MYSQL_ROOT_PASSWORD=toast
ENV MYSQL_USER=user
ENV MYSQL_PASSWORD=password
ENV MYSQL_DATABASE=tam
