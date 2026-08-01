const PARALLEL_STAGES = new Set([
  "G0_SOURCE_AND_G1_RESEARCH",
  "G2_IMAGE_ASSETS",
  "G3_MOTION_ASSETS",
  "G4_QA_LANES",
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeDuration(value) {
  return Number.isFinite(value) && value >= 0 ? Number(value) : 0;
}

export function analyzePerformanceTrace(trace = []) {
  const events = asArray(trace).map((event, index) => ({
    stage_id: String(event?.stage_id || `unknown-${index + 1}`),
    work_item_id: String(event?.work_item_id || `item-${index + 1}`),
    duration_ms: safeDuration(event?.duration_ms),
    cache_status: String(event?.cache_status || "miss"),
  }));
  const groups = new Map();
  for (const event of events) {
    if (!groups.has(event.stage_id)) groups.set(event.stage_id, []);
    groups.get(event.stage_id).push(event);
  }
  const stage_profiles = [...groups.entries()].map(([stage_id, items]) => {
    const total = items.reduce((sum, item) => sum + item.duration_ms, 0);
    const longest = items.reduce(
      (maximum, item) => Math.max(maximum, item.duration_ms),
      0,
    );
    const parallel = PARALLEL_STAGES.has(stage_id);
    return {
      stage_id,
      item_count: items.length,
      sequential_duration_ms: total,
      estimated_parallel_duration_ms: parallel ? longest : total,
      estimated_parallel_savings_ms: parallel ? Math.max(0, total - longest) : 0,
      cache_hit_count: items.filter((item) => item.cache_status === "hit").length,
    };
  }).sort(
    (left, right) =>
      right.sequential_duration_ms - left.sequential_duration_ms,
  );
  const totalSequential = stage_profiles.reduce(
    (sum, stage) => sum + stage.sequential_duration_ms,
    0,
  );
  const totalOptimized = stage_profiles.reduce(
    (sum, stage) => sum + stage.estimated_parallel_duration_ms,
    0,
  );
  return {
    policy_id: "policy.detail-page-speed.v1",
    longest_stage: stage_profiles[0] ?? null,
    stage_profiles,
    observed_sequential_duration_ms: totalSequential,
    estimated_optimized_duration_ms: totalOptimized,
    estimated_savings_ms: Math.max(0, totalSequential - totalOptimized),
    mandatory_fast_path: {
      image_generation: {
        batch_size: 32,
        provider_workers: 32,
        strategy: "single_concurrent_batch",
      },
      motion_generation: "lease_ready_modules_immediately",
      cache: "reuse_verified_members_and_descendants",
      retry: "failed_member_and_descendants_only",
      browser_capture: "one_final_multi_viewport_pass_plus_changed_section_repairs",
      export: "reuse_approved_immutable_media_without_regeneration",
    },
    recommendations: [
      "G0 공급처 정규화와 G1 시장 조사를 브라우저 lane 밖에서 병렬 준비",
      "G2의 32개 이미지 cut을 God Tibo 32 provider workers 단일 batch로 생성",
      "제품 참조만 필요한 G3 motion은 G2 전체 완료를 기다리지 않고 즉시 시작",
      "통과 member·capture·CDN 자산은 digest가 같으면 재사용하고 전체 재생성 금지",
      "390 quick preview 뒤 최종 320·360·390·780 캡처를 한 번만 실행",
    ],
  };
}
