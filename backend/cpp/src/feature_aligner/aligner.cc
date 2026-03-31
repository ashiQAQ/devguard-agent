// feature_aligner.cc
// 功能点与基线模块对齐引擎实现

#include "devguard/feature_aligner.h"

#include <algorithm>
#include <cmath>
#include <sstream>
#include <unordered_set>

// 简单 JSON 解析（生产环境使用 nlohmann/json）
#include <nlohmann/json.hpp>

namespace devguard {

FeatureAligner::FeatureAligner() = default;
FeatureAligner::~FeatureAligner() = default;

bool FeatureAligner::LoadBaseline(const std::string& baseline_json) {
  try {
    auto j = nlohmann::json::parse(baseline_json);
    baseline_modules_.clear();
    module_index_.clear();

    for (auto& [key, val] : j["modules"].items()) {
      Module m;
      m.id = val.value("id", key);
      m.name = val.value("name", "");
      m.asil = val.value("asil", "");
      m.rt = val.value("rt", false);

      for (auto& kw : val.value("keywords", nlohmann::json::array())) {
        m.keywords.push_back(kw.get<std::string>());
      }
      for (auto& cls : val.value("classes", nlohmann::json::array())) {
        m.classes.push_back(cls.get<std::string>());
      }
      for (auto& fn : val.value("functions", nlohmann::json::array())) {
        m.functions.push_back(fn.get<std::string>());
      }

      baseline_modules_.push_back(m);
      module_index_[m.id] = m;
    }
    return true;
  } catch (const std::exception& e) {
    return false;
  }
}

std::vector<AlignmentResult> FeatureAligner::AlignFeatures(
    const std::vector<Feature>& features) {
  std::vector<AlignmentResult> results;

  for (const auto& feature : features) {
    AlignmentResult best;
    best.feature_id = feature.id;
    best.similarity = 0.0f;

    for (const auto& module : baseline_modules_) {
      float sim = GraphMatching(feature, module);
      if (sim > best.similarity) {
        best.similarity = sim;
        best.module_id = module.id;

        // 记录命中的关键词
        best.matched_keywords.clear();
        for (const auto& kw : feature.keywords) {
          for (const auto& mkw : module.keywords) {
            if (kw == mkw) {
              best.matched_keywords.push_back(kw);
            }
          }
        }
      }
    }

    // 判断对齐类型
    if (best.similarity >= 0.8f) {
      best.alignment_type = "exact";
    } else if (best.similarity >= 0.4f) {
      best.alignment_type = "partial";
    } else {
      best.alignment_type = "new";
    }

    results.push_back(best);
  }

  return results;
}

float FeatureAligner::GraphMatching(const Feature& feature,
                                     const Module& module) {
  // 关键词匹配权重 0.6
  float kw_score = KeywordMatching(feature.keywords, module.keywords) * 0.6f;

  // 名称相似度权重 0.4（简单字符串包含）
  float name_score = 0.0f;
  std::string feat_lower = feature.name;
  std::string mod_lower = module.name;
  std::transform(feat_lower.begin(), feat_lower.end(), feat_lower.begin(),
                 ::tolower);
  std::transform(mod_lower.begin(), mod_lower.end(), mod_lower.begin(),
                 ::tolower);
  if (feat_lower.find(mod_lower) != std::string::npos ||
      mod_lower.find(feat_lower) != std::string::npos) {
    name_score = 0.4f;
  }

  return kw_score + name_score;
}

float FeatureAligner::KeywordMatching(
    const std::vector<std::string>& feature_keywords,
    const std::vector<std::string>& module_keywords) {
  if (feature_keywords.empty() || module_keywords.empty()) return 0.0f;

  std::unordered_set<std::string> module_kw_set(module_keywords.begin(),
                                                 module_keywords.end());
  int matched = 0;
  for (const auto& kw : feature_keywords) {
    if (module_kw_set.count(kw)) {
      ++matched;
    }
  }

  // Jaccard 相似度
  int total = static_cast<int>(feature_keywords.size() +
                                module_keywords.size() - matched);
  return total > 0 ? static_cast<float>(matched) / total : 0.0f;
}

float FeatureAligner::ComputeSimilarity(
    const std::vector<std::string>& feature_keywords,
    const std::vector<std::string>& module_keywords) {
  return KeywordMatching(feature_keywords, module_keywords);
}

}  // namespace devguard
