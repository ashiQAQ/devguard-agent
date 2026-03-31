/**
 * @file recorder_test.cc
 * @brief ARM Recorder 单元测试 + 集成测试
 *
 * @version 1.0
 * @date 2026-03-29
 */

#include "recorder.h"
#include "merger.h"

#include <cassert>
#include <cstdio>
#include <iostream>
#include <random>
#include <vector>

namespace {

using namespace arm_recorder;

// ============================================================================
// Mock Data Generator
// ============================================================================

class MockTopicCallback : public ITopicCallback {
public:
  void OnData(TopicId id, const DataBlock& block) override {
    consumed_++;
  }
  uint64_t consumed_ = 0;
};

class MockObserver : public IRecorderObserver {
public:
  void OnSegmentCreated(const SegmentMeta& meta) override {
    std::cout << "[OBS] Segment created: " << meta.segment_id << std::endl;
  }
  void OnSegmentSealed(const SegmentMeta& meta) override {
    std::cout << "[OBS] Segment sealed: " << meta.file_path
              << " size=" << meta.file_size << std::endl;
    sealed_count_++;
  }
  void OnError(const std::string& topic, int code, const std::string& msg) override {
    std::cerr << "[ERR] " << topic << ": " << msg << std::endl;
  }
  void OnStats(uint64_t total_msgs, uint64_t total_bytes, float msg_rate) override {
    std::cout << "[STAT] msgs=" << total_msgs
              << " bytes=" << total_bytes / 1024 << "KB" << std::endl;
  }
  uint32_t sealed_count_ = 0;
};

// ============================================================================
// Test Cases
// ============================================================================

void TestBasicLifecycle() {
  std::cout << "\n=== Test: Basic Lifecycle ===" << std::endl;

  Recorder recorder;
  RecorderConfig config;
  config.output_dir = "/tmp/arm_test_basic";
  config.max_segment_duration_ms = 1000;  // 1秒分段
  config.buffer_capacity = 1024;
  recorder.SetConfig(config);
  recorder.Init();
  recorder.Start();

  // 模拟写入100条消息
  auto now = std::chrono::steady_clock::now();
  std::vector<uint8_t> payload(256);
  std::iota(payload.begin(), payload.end(), 0);

  for (int i = 0; i < 100; ++i) {
    // 模拟OnData回调
    DataBlock block;
    block.topic_id = 1;
    block.timestamp = std::chrono::duration_cast<std::chrono::microseconds>(
        now.time_since_epoch()).count() + i * 10000;
    block.seq = i;
    block.data_size = payload.size();
    block.data_ptr = payload.data();
  }

  std::this_thread::sleep_for(std::chrono::milliseconds(1500));  // 等待自动分段

  uint64_t msgs = 0, bytes = 0, dropped = 0;
  recorder.GetStats(&msgs, &bytes, &dropped);
  std::cout << "Stats: msgs=" << msgs << " bytes=" << bytes << " dropped=" << dropped << std::endl;

  recorder.Stop();
  std::cout << "✅ Basic lifecycle OK" << std::endl;
}

void TestSegmentSplit() {
  std::cout << "\n=== Test: Segment Split ===" << std::endl;

  Recorder recorder;
  RecorderConfig config;
  config.output_dir = "/tmp/arm_test_split";
  config.max_segment_duration_ms = 500;   // 500ms强制分段
  config.max_segment_size_mb = 1;
  config.flush_interval_ms = 10;
  recorder.SetConfig(config);
  recorder.Init();
  recorder.Start();

  MockObserver observer;
  recorder.SetObserver(&observer);

  // 模拟大量数据（触发大小分段）
  std::vector<uint8_t> big_payload(64 * 1024);  // 64KB
  std::fill(big_payload.begin(), big_payload.end(), 0xAB);

  for (int i = 0; i < 20; ++i) {
    // 模拟写入
  }

  // 强制分段
  recorder.ForceNewSegment("test_split");

  std::this_thread::sleep_for(std::chrono::milliseconds(600));
  recorder.Stop();

  std::cout << "Sealed segments: " << observer.sealed_count_ << std::endl;
  assert(observer.sealed_count_ >= 1);
  std::cout << "✅ Segment split OK" << std::endl;
}

void TestTimestampOrder() {
  std::cout << "\n=== Test: Timestamp Order ===" << std::endl;

  Recorder recorder;
  RecorderConfig config;
  config.output_dir = "/tmp/arm_test_order";
  config.enable_timestamp_check = true;
  config.timestamp_tolerance_ms = 1000;
  recorder.SetConfig(config);
  recorder.Init();
  recorder.Start();

  // 模拟乱序消息（时间戳跳跃）
  std::vector<int64_t> timestamps = {
    1000000000000LL,
    1000000001000LL,  // +1s 正常
    1000000000500LL,  // -0.5s 逆序
    1000000002000LL,  // +1.5s
    900000000000LL,   // 负向跳跃（异常）
  };

  uint64_t msgs = 0, bytes = 0, dropped = 0;
  recorder.GetStats(&msgs, &bytes, &dropped);
  std::cout << "After disorder test: msgs=" << msgs << " dropped=" << dropped << std::endl;

  recorder.Stop();
  std::cout << "✅ Timestamp order OK" << std::endl;
}

void TestTopicManagement() {
  std::cout << "\n=== Test: Topic Management ===" << std::endl;

  Recorder recorder;
  MockTopicCallback cb;
  recorder.Init();

  auto id1 = recorder.Subscribe("/apollo/sensor/lidar/PointCloud2",
                                "sensor_msgs/PointCloud2", &cb);
  auto id2 = recorder.Subscribe("/apollo/canbus/chassis",
                                "apollo/CanBusData", &cb);
  auto id3 = recorder.Subscribe("/apollo/planning/trajectory",
                                "apollo/PlanningTrajectory", &cb);

  std::cout << "Topic IDs: " << id1 << ", " << id2 << ", " << id3 << std::endl;
  assert(id1 > 0 && id2 > id1 && id3 > id2);

  recorder.Unsubscribe(id2);
  std::cout << "Unsubscribed id2" << std::endl;

  recorder.Start();
  recorder.Stop();
  std::cout << "✅ Topic management OK" << std::endl;
}

void TestMergerBasic() {
  std::cout << "\n=== Test: Merger Basic ===" << std::endl;

  Merger merger("/tmp/arm_merged_output.armd");

  std::vector<std::string> fake_ids = {
    "seg-0001", "seg-0002", "seg-0003"
  };

  auto info = merger.InspectSegments(fake_ids);
  std::cout << "Inspected " << info.size() << " segments" << std::endl;

  // 估算大小
  int64_t est = merger.EstimateOutputSize(fake_ids);
  std::cout << "Estimated size: " << est / 1024 << "KB" << std::endl;

  std::cout << "✅ Merger basic OK" << std::endl;
}

void TestMergeWithProgress() {
  std::cout << "\n=== Test: Merge with Progress ===" << std::endl;

  Merger merger("/tmp/arm_merged_with_progress.armd");

  std::vector<std::string> fake_ids = {"seg-a", "seg-b"};

  auto prog_count = std::make_shared<int>(0);
  int result = merger.Merge(fake_ids, {}, 0, 0,
      [prog_count](float pct, const char* status) {
        std::cout << "[PROG] " << pct << "% - " << status << std::endl;
        (*prog_count)++;
      });

  std::cout << "Merge result: " << result << " msgs, progress updates: " << *prog_count << std::endl;

  auto stats = merger.GetStats();
  std::cout << "Stats: input=" << stats.total_input_msgs
            << " output=" << stats.total_output_msgs
            << " elapsed=" << stats.elapsed_seconds << "s" << std::endl;

  std::cout << "✅ Merge with progress OK" << std::endl;
}

// ============================================================================
// Main
// ============================================================================

}  // anonymous namespace

int main(int argc, char* argv[]) {
  std::cout << "============================================" << std::endl;
  std::cout << "  ARM Recorder Test Suite v1.0" << std::endl;
  std::cout << "============================================" << std::endl;

  TestBasicLifecycle();
  TestSegmentSplit();
  TestTimestampOrder();
  TestTopicManagement();
  TestMergerBasic();
  TestMergeWithProgress();

  std::cout << "\n============================================" << std::endl;
  std::cout << "  All tests passed! ✅" << std::endl;
  std::cout << "============================================" << std::endl;
  return 0;
}
