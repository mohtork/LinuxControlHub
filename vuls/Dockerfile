# ---------- Stage 1: Build go-cve-dictionary ----------
FROM golang:1.22-alpine AS builder

ENV GOTOOLCHAIN=auto
RUN apk add --no-cache git

WORKDIR /build
RUN git clone https://github.com/kotakanbe/go-cve-dictionary.git .
RUN go build -o /go-cve-dictionary main.go

# ---------- Stage 2: Final Vuls image ----------
FROM vuls/vuls:latest

# Install essential tools Vuls needs
RUN apk add --no-cache sqlite git gcc

# Copy go-cve-dictionary binary
COPY --from=builder /go-cve-dictionary /usr/local/bin/go-cve-dictionary

# CVE DB directory
WORKDIR /var/lib/vuls

# Fetch CVEs from NVD and JVN (2020–2024)
RUN for y in 2024; do \
  go-cve-dictionary fetch nvd $y && \
  go-cve-dictionary fetch jvn $y; \
done

# Vuls working directory
WORKDIR /vuls

# Create directories for results
#RUN mkdir -p /vuls/results
RUN mkdir /vuls/results

# Stay alive by default
CMD ["tail", "-f", "/dev/null"]