# Dockerfile.cpp
# C++ 高性能模块容器

FROM ubuntu:22.04

WORKDIR /app

# 安装依赖
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    libboost-all-dev \
    nlohmann-json3-dev \
    protobuf-compiler \
    libprotobuf-dev \
    && rm -rf /var/lib/apt/lists/*

# 复制源代码
COPY backend/cpp /app/cpp

# 编译
RUN cd /app/cpp && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make -j$(nproc) && \
    make install

# 暴露 IPC 端口
EXPOSE 9000

# 启动命令
CMD ["/app/cpp/build/devguard-cpp-server"]
