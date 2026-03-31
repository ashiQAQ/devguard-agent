cmake_minimum_required(VERSION 3.16)
project(devguard-cpp VERSION 2.4.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 编译选项
add_compile_options(-Wall -Wextra -Werror)

# 依赖
find_package(Boost REQUIRED COMPONENTS graph)
find_package(nlohmann_json REQUIRED)
find_package(Protobuf REQUIRED)

# Protocol Buffers
protobuf_generate_cpp(PROTO_SRCS PROTO_HDRS
    include/devguard/proto/baseline.proto
    include/devguard/proto/requirement.proto
    include/devguard/proto/performance.proto
)

# 包含目录
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/include)
include_directories(${CMAKE_CURRENT_BINARY_DIR})

# 源文件
set(SOURCES
    src/feature_aligner/aligner.cc
    src/code_scanner/scanner.cc
    src/adcu_simulator/simulator.cc
    src/data_playback/playback.cc
    src/perf_collector/collector.cc
    src/baseline_db/baseline.cc
    # 新增：符号需求校验引擎（零外部依赖）
    src/symbolic_validator/symbolic_validator.cc
    # 新增：CAN 信号实时监控器（域控部署）
    src/can_signal_monitor/can_signal_monitor.cc
    # 新增：gRPC Bridge（调车本↔域控通信）
    src/grpc_bridge/grpc_bridge.cc
    ${PROTO_SRCS}
)

# gRPC 依赖（可选）
find_package(Protobuf REQUIRED)
# find_package(grpc++ QUIET)
set(GRPC_FOUND FALSE)
# if(grpc++_FOUND)
#     set(GRPC_FOUND TRUE)
#     list(APPEND EXTRA_LIBS grpc++)
# endif()

# 库
add_library(devguard-cpp SHARED ${SOURCES})
target_link_libraries(devguard-cpp
    PUBLIC
        Boost::graph
        nlohmann_json::nlohmann_json
        protobuf::libprotobuf
)

# 测试
enable_testing()
add_executable(feature_aligner_test src/feature_aligner/aligner.cc tests/feature_aligner_test.cc)
target_link_libraries(feature_aligner_test devguard-cpp)
add_test(NAME FeatureAlignerTest COMMAND feature_aligner_test)

# 安装
install(TARGETS devguard-cpp
    LIBRARY DESTINATION lib
    ARCHIVE DESTINATION lib
)
install(DIRECTORY include/devguard DESTINATION include)
