"""
状态机模块
"""

from typing import Callable, Dict, List, Optional, Any
from dataclasses import dataclass
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class State(Enum):
    """状态枚举"""
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class Transition:
    """状态转移"""
    from_state: State
    to_state: State
    event: str
    condition: Optional[Callable] = None
    action: Optional[Callable] = None


class StateMachine:
    """简单状态机"""
    
    def __init__(self, initial_state: State = State.IDLE):
        self.current_state = initial_state
        self.transitions: Dict[str, List[Transition]] = {}
        self.history: List[Dict[str, Any]] = []
    
    def add_transition(self, transition: Transition):
        """添加状态转移"""
        key = f"{transition.from_state.value}:{transition.event}"
        if key not in self.transitions:
            self.transitions[key] = []
        self.transitions[key].append(transition)
    
    def can_transition(self, event: str) -> bool:
        """检查是否可以转移"""
        key = f"{self.current_state.value}:{event}"
        return key in self.transitions
    
    def trigger(self, event: str, **kwargs) -> bool:
        """触发事件"""
        key = f"{self.current_state.value}:{event}"
        transitions = self.transitions.get(key, [])
        
        if not transitions:
            logger.warning(f"无有效转移: {key}")
            return False
        
        for t in transitions:
            if t.condition is None or t.condition(**kwargs):
                # 执行动作
                if t.action:
                    try:
                        t.action(**kwargs)
                    except Exception as e:
                        logger.error(f"动作执行失败: {e}")
                        self.current_state = State.FAILED
                        return False
                
                # 状态转移
                old_state = self.current_state
                self.current_state = t.to_state
                
                # 记录历史
                self.history.append({
                    "from": old_state.value,
                    "to": t.to_state.value,
                    "event": event,
                })
                
                logger.info(f"状态转移: {old_state.value} -> {t.to_state.value}")
                return True
        
        return False
    
    def reset(self):
        """重置状态机"""
        self.current_state = State.IDLE
        self.history.clear()
    
    def get_history(self) -> List[Dict[str, Any]]:
        """获取历史"""
        return self.history.copy()
