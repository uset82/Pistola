# SolidCraft CLI for the Pistola CAD helper.
#
# Debian slim rather than Alpine: the release binary is glibc-linked and needs
# at least GLIBC_2.35, which musl does not provide. Inspecting the 0.25.1
# tarball with readelf shows solidcraft-cli needs only libgcc_s, libm and
# libc, so no GUI libraries are installed — the desktop binary is discarded.
#
# A local build is optional. `railway up` builds this remotely; that is the
# path this repository uses.

# syntax=docker/dockerfile:1
FROM python:3.13-slim

ARG SOLIDCRAFT_VERSION=0.25.1
ARG SOLIDCRAFT_TARBALL=solidcraft-${SOLIDCRAFT_VERSION}-linux-x86_64.tar.gz
# Pin the archive as well as the version: upgrading requires both lines.
ARG SOLIDCRAFT_SHA256=5e467b42530808c75e19f4993247d9ab736e700a1532e40eab2bd3da42a2db2f

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SOLIDCRAFT_CLI_PATH=/usr/local/bin/solidcraft-cli

# This image installs SolidCraft and no FreeCAD, so it must not fall back to
# the FreeCAD default that applies everywhere else.
ENV PISTOLA_CAD_ENGINE=solidcraft

# The image exists to be reached over a network, so the passthrough job types
# start closed here even though they default open locally. Platform variables
# still override both of these.
ENV PISTOLA_CAD_ALLOW_PASSTHROUGH=0

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    release="https://github.com/tangency-labs/solidcraft/releases/download/v${SOLIDCRAFT_VERSION}"; \
    curl -fsSL -o "/tmp/${SOLIDCRAFT_TARBALL}" "${release}/${SOLIDCRAFT_TARBALL}"; \
    curl -fsSL -o /tmp/SHA256SUMS.txt "${release}/SHA256SUMS.txt"; \
    cd /tmp; \
    echo "${SOLIDCRAFT_SHA256}  ${SOLIDCRAFT_TARBALL}" | sha256sum -c -; \
    awk -v file="${SOLIDCRAFT_TARBALL}" '$2 == file' SHA256SUMS.txt | sha256sum -c -; \
    tar -xzf "${SOLIDCRAFT_TARBALL}"; \
    install -m 0755 "solidcraft-${SOLIDCRAFT_VERSION}-linux-x86_64/bin/solidcraft-cli" /usr/local/bin/solidcraft-cli; \
    rm -rf /tmp/solidcraft* /tmp/SHA256SUMS.txt; \
    solidcraft-cli --version

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --create-home --uid 10001 cad \
    && mkdir -p /app/.artifacts \
    && chown -R cad:cad /app
USER cad

ENV PORT=8080
EXPOSE 8080

# Railway injects PORT; binding a hardcoded 8080 would fail its health check.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
