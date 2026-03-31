// feature_aligner.h
// 功能点与基线模块对齐引擎
// 使用图匹配算法，计算功能点与基线模块的相似度

#pragma once

#include <string>
#include <vector>
#include <map>
#include <memory>

namespace devguard {

// 功能点结构
struct Feature {
  std::string id;
  std::string name;
  std::string description;
  std::vector<std::string> keywords;
  int priority;  // 0-3
};

// 基线模块结构
struct Module {
  std::string id;
  std::string name;
  std::vector<std::string> keywords;
  std::vector<std::string> classes;
  std::vector<std::string> functions;
  std::string asil;  // ASIL 等级
  bool rt;           // 实时性要求
};

// 对齐结果
struct AlignmentResult {
  std::string feature_id;
  std::string module_id;
  float similarity;  // 0.0 - 1.0
  std::vector<std::string> matched_keywords;
  std::string alignment_type;  // "exact" / "partial" / "new"
};

// 功能点对齐引擎
class FeatureAligner {
 public:
  FeatureAligner();
  ~FeatureAligner();

  // 初始化基线
  bool LoadBaseline(const std::string& baseline_json);

  // 对齐功能点
  // @param features: 需求中的功能点列表
  // @return: 对齐结果列表
  std::vector<AlignmentResult> AlignFeatures(
      const std::vector<Feature>& features);

  // 计算两个关键词集合的相似度
  float ComputeSimilarity(const std::vector<std::string>& feature_keywords,
                          const std::vector<std::string>& module_keywords);

 private:
  // 图匹配算法
  float GraphMatching(const Feature& feature, const Module& module);

  // 关键词匹配
  float KeywordMatching(const std::vector<std::string>& feature_keywords,
                        const std::vector<std::string>& module_keywords);

  std::vector<Module> baseline_modules_;
  std::map<std::string, Module> module_index_;
};

}  // namespace devguard
