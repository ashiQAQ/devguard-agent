/**
 * arm_recorder — 主程序入口
 * 基线版本 v1.0
 */
#include "arm_recorder.h"
#include <iostream>
#include <signal.h>

static arm_recorder::ArmRecorder* g_recorder = nullptr;

void signal_handler(int sig) {
  std::cout << "\n[ArmRecorder] Stopping (signal " << sig << ")...\n";
  if (g_recorder) g_recorder->stop();
}

int main(int argc, char** argv) {
  arm_recorder::RecorderConfig cfg;
  cfg.output_dir       = argc > 1 ? argv[1] : "/data/recordings";
  cfg.max_file_size_mb = 512;
  cfg.ring_buffer_size = 4096;

  arm_recorder::ArmRecorder recorder(cfg);
  g_recorder = &recorder;

  signal(SIGINT,  signal_handler);
  signal(SIGTERM, signal_handler);

  std::cout << "[ArmRecorder] Starting, output: " << cfg.output_dir << "\n";
  recorder.start();

  // 模拟消息接收（实际由 ROS2 回调驱动）
  uint64_t ts = 1711555200000000000ULL;  // 2024-03-28 00:00:00 UTC
  for (int i = 0; i < 1000; ++i) {
    arm_recorder::Message msg;
    msg.header.timestamp_ns = ts + i * 100000000ULL;  // 100ms 间隔
    msg.header.seq = i;
    msg.topic = cfg.topics[i % cfg.topics.size()];
    msg.data.resize(1024, static_cast<uint8_t>(i & 0xFF));
    recorder.on_message(std::move(msg));
  }

  std::this_thread::sleep_for(std::chrono::milliseconds(500));
  recorder.stop();

  std::cout << "[ArmRecorder] Done. Dropped: " << recorder.dropped() << "\n";
  return 0;
}
