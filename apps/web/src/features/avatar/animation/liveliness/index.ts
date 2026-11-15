/** 自然度与防穿模子域入口（呼吸 / 不对称 / 微扰 / 张力上游 / 手部间距） */
export {
  DEFAULT_LIVELINESS,
  LivelinessLayer,
  supportFactor,
  type LivelinessParams,
} from './liveliness';
export {
  TENSION,
  dampTension,
  tensionTarget,
  type LivelinessState,
} from './tension';
export {
  DEFAULT_HAND_CLEARANCE,
  clearanceTarget,
  type HandClearanceParams,
} from './hand-clearance';
