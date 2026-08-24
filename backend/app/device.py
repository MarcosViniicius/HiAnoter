"""Any-GPU detection + engine selection at backend startup.

Engines
-------
* ``faster-whisper`` (CTranslate2) — NVIDIA/CUDA (float16/int8_float16) ou CPU/int8.
* ``whisper-cpp``       (whisper.cpp/GGML) — GPU não-NVIDIA:
    AMD/Intel via **Vulkan** (Windows/Linux) e Apple Silicon via **Metal**.

Filosofia: reconhecer QUALQUER GPU presente no host, expor isso em ``/api/health``
e escolher o melhor motor/backend disponível. Nunca silenciosamente na CPU quando
existe uma GPU utilizável. Fallbacks em runtime (falha ao carregar o modelo no
backend escolhido) atualizam o ``DeviceInfo`` corrente via ``set_current``.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import sys
import threading
from dataclasses import asdict, dataclass, field

from .config import Settings

logger = logging.getLogger("hinoter.device")

VRAM_FLOAT16_THRESHOLD_MIB = 8192  # >= 8GB => float16, otherwise int8_float16


@dataclass
class Gpu:
    vendor: str  # nvidia | amd | intel | apple | unknown
    name: str
    vram_mib: int | None = None
    backends: list[str] = field(default_factory=list)  # cuda | rock | vulkan | metal

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class DeviceInfo:
    engine: str = "faster-whisper"  # faster-whisper | whisper-cpp
    device: str = "cpu"             # cuda | vulkan | metal | cpu
    compute_type: str = "int8"
    gpu_name: str | None = None
    gpu_vram_mib: int | None = None
    backend: str = "cpu"
    gpus: list[dict] = field(default_factory=list)
    notes: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


_lock = threading.Lock()
_current: DeviceInfo = DeviceInfo()


def set_current(info: DeviceInfo) -> None:
    global _current
    with _lock:
        _current = info


def get_current() -> DeviceInfo:
    with _lock:
        return DeviceInfo(**{**_current.__dict__, "gpus": list(_current.gpus)})


# ---------------------------------------------------------------- utils

def _run(cmd: list[str], timeout: float = 10.0) -> subprocess.CompletedProcess | None:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired) as exc:
        logger.debug("[device] comando nao executou: %s (%s)", cmd, exc)
        return None


def _vendor_of(name: str) -> str:
    low = name.lower()
    hints = {
        "nvidia": ("nvidia", "geforce", "quadro", "tesla", "rtx", "gtx"),
        "amd": ("radeon", "amd", "rx ", "ryzen"),
        "intel": ("intel", "arc", "uhd", "iris", "hd graphics"),
        "apple": ("apple", "m1", "m2", "m3", "m4"),
    }
    for vendor, keys in hints.items():
        if any(k in low for k in keys):
            return vendor
    return "unknown"


# ---------------------------------------------------------------- per-vendor

def detect_nvidia_gpu() -> Gpu | None:
    exe = shutil.which("nvidia-smi")
    if not exe:
        return None
    proc = _run([exe, "--query-gpu=name,memory.total", "--format=csv,noheader"], timeout=10.0)
    if not proc or proc.returncode != 0 or not proc.stdout.strip():
        return None
    line = proc.stdout.strip().splitlines()[0]
    parts = [p.strip() for p in line.split(",")]
    if len(parts) < 2 or not parts[0]:
        return None
    digits = "".join(ch for ch in parts[1] if ch.isdigit())
    return Gpu(vendor="nvidia", name=parts[0], vram_mib=int(digits) if digits else None, backends=["cuda"])


def detect_windows_gpus() -> list[Gpu]:
    proc = _run(
        ["powershell", "-NoProfile", "-Command",
         "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"],
        timeout=20.0,
    )
    gpus: list[Gpu] = []
    if proc and proc.returncode == 0:
        for name in (n.strip() for n in proc.stdout.splitlines() if n.strip()):
            vendor = _vendor_of(name)
            if vendor == "nvidia":
                continue  # já coberto pelo nvidia-smi
            gpus.append(Gpu(vendor=vendor, name=name, backends=["metal"] if sys.platform == "darwin" else ["vulkan", "opencl"]))
    return gpus


def detect_linux_gpus() -> list[Gpu]:
    gpus: list[Gpu] = []
    if shutil.which("rocm-smi"):
        proc = _run([shutil.which("rocm-smi"), "--showproductname", "--showmeminfo", "vram"], timeout=15.0)
        if proc and proc.returncode == 0:
            name = "AMD GPU (ROCm)"
            for line in proc.stdout.splitlines():
                s = line.strip()
                if s and "memory" not in s.lower() and "total" not in s.lower() and "[" not in s:
                    name = s
            gpus.append(Gpu(vendor="amd", name=name, backends=["rock", "vulkan"] if vulkan_runtime_available() else ["rock"]))
            return gpus
    proc = _run(["sh", "-c", "lspci 2>/dev/null | grep -i -E 'vga|3d|display' || true"], timeout=10.0)
    if proc and proc.returncode == 0:
        for raw in (l.strip() for l in proc.stdout.splitlines() if l.strip()):
            if "nvidia" in raw.lower():
                continue
            name = _readable_lspci(raw)
            if not name:
                continue
            vendor = "amd" if any(k in name.lower() for k in ("radeon", "amd", "rx ")) else ("intel" if "intel" in name.lower() else "unknown")
            gpus.append(Gpu(vendor=vendor, name=name, backends=["vulkan", "opencl"] if vulkan_runtime_available() else ["opencl"]))
    return gpus


def _readable_lspci(line: str) -> str:
    """Linha lspci -> nome legível da placa."""
    # "06:00.0 VGA compatible controller [0300]: Advanced Micro Devices... Radeon RX 7600 [1002:744c]"
    after = line.split(":", 1)[1].strip() if ":" in line else line
    # recorta até o primeiro colchete do fina "[ven:dev]" e tira possíveis "(rev aa)"
    for token in ("[0300]", "[0302]", "[0304]"):
        after = after.replace(token, "")
    import re
    after = re.sub(r"\[[0-9a-f]{4}:[0-9a-f]{4}\]", "", after).strip()
    if after.endswith("]"):
        after = after.rsplit("[", 1)[0].strip()
    return after.strip() or None


def detect_apple_gpu() -> list[Gpu]:
    if sys.platform != "darwin":
        return []
    import platform as _p
    return [Gpu(vendor="apple", name="Apple Silicon", backends=["metal"])] if _p.machine() == "arm64" else []


def vulkan_runtime_available() -> bool:
    if sys.platform == "win32":
        return os.path.exists(r"C:\Windows\System32\vulkan-1.dll")
    if shutil.which("vulkaninfo"):
        proc = _run(["vulkaninfo", "--summary"], timeout=8.0)
        return bool(proc and proc.returncode == 0)
    return os.path.exists("/usr/share/vulkan/icd.d")


def whispercpp_available() -> bool:
    """True se o binding whisper.cpp (pywhispercpp) estiver instalado."""
    try:
        import pywhispercpp  # noqa: F401
        return True
    except Exception:
        return False


# ---------------------------------------------------------------- selection

def detect_gpus() -> list[Gpu]:
    nvidia = detect_nvidia_gpu()
    others = []
    if sys.platform == "win32":
        others = detect_windows_gpus()
    elif sys.platform.startswith("linux"):
        others = detect_linux_gpus()
    elif sys.platform == "darwin":
        others = detect_apple_gpu()

    all_gpus = ([nvidia] if nvidia else []) + others
    seen: set[str] = set()
    uniq: list[Gpu] = []
    for g in all_gpus:
        key = g.name.lower()
        if key in seen:
            continue
        seen.add(key)
        uniq.append(g)
    return uniq


def _cpu(info: DeviceInfo, note: str) -> DeviceInfo:
    info.engine = "faster-whisper"
    info.device = "cpu"
    info.compute_type = "int8"
    info.backend = "cpu"
    info.notes = note
    return info


def select_engine(settings: Settings, gpus: list[Gpu], mode: str) -> DeviceInfo:
    nvidia = next((g for g in gpus if g.vendor == "nvidia"), None)
    non_nvidia = next((g for g in gpus if g.vendor != "nvidia"), None)
    engine_pref = (settings.whisper_engine or "auto").strip().lower()
    has_cpp = whispercpp_available()

    def _nvidia_info() -> DeviceInfo:
        compute = "float16" if (nvidia.vram_mib or 0) >= VRAM_FLOAT16_THRESHOLD_MIB else "int8_float16"
        return DeviceInfo(
            engine="faster-whisper", device="cuda", compute_type=compute,
            gpu_name=nvidia.name, gpu_vram_mib=nvidia.vram_mib, backend="cuda",
            gpus=[g.to_dict() for g in gpus],
            notes=f"GPU detectada: {nvidia.name} ({nvidia.vram_mib} MiB) => CUDA/{compute}",
        )

    base = DeviceInfo(gpus=[g.to_dict() for g in gpus])

    if mode == "cpu":
        note = "WHISPER_DEVICE=cpu (forçado pelo usuário)"
        target_gpu = nvidia or non_nvidia
        if target_gpu:
            note += f"; GPU presente mas ignorada: {target_gpu.name}"
        info = _cpu(base, note)
        logger.info("[device] WHISPER_DEVICE=cpu%s", "; GPU ignorada" if target_gpu else "")
        return info

    if mode == "cuda":
        if not nvidia:
            raise RuntimeError(
                "WHISPER_DEVICE=cuda mas nenhuma GPU NVIDIA detectada. "
                "Instale o driver CUDA ou use WHISPER_DEVICE=auto."
            )
        info = _nvidia_info()
        logger.info("[device] WHISPER_DEVICE=cuda + %s => CUDA/%s", nvidia.name, info.compute_type)
        return info

    amd = next((g for g in gpus if g.vendor == "amd"), None)

    if mode == "rocm":
        name = amd.name if amd else "GPU AMD (ROCm)"
        compute = "float16" if (amd and (amd.vram_mib or 0) >= VRAM_FLOAT16_THRESHOLD_MIB) else "int8_float16"
        info = DeviceInfo(
            engine="faster-whisper",
            device="cuda",  # CTranslate2 / PyTorch ROCm usa backend 'cuda' via HIP shim
            compute_type=compute,
            gpu_name=name,
            gpu_vram_mib=amd.vram_mib if amd else None,
            backend="rocm",
            gpus=[g.to_dict() for g in gpus],
            notes=f"GPU AMD ROCm/HIP: {name} => {compute}",
        )
        logger.info("[device] WHISPER_DEVICE=rocm + %s => ROCm/%s", name, info.compute_type)
        return info

    if mode == "vulkan":
        name = non_nvidia.name if non_nvidia else (amd.name if amd else "GPU Vulkan")
        info = DeviceInfo(
            engine="whisper-cpp" if has_cpp else "faster-whisper",
            device="vulkan" if has_cpp else "cpu",
            compute_type="ggml-vulkan" if has_cpp else "int8",
            gpu_name=name,
            gpu_vram_mib=non_nvidia.vram_mib if non_nvidia else None,
            backend="vulkan" if has_cpp else "cpu",
            gpus=[g.to_dict() for g in gpus],
            notes=f"GPU Vulkan: {name}" if has_cpp else f"Vulkan selecionado ({name}), rodando em CPU/int8",
        )
        logger.info("[device] WHISPER_DEVICE=vulkan + %s", name)
        return info

    # ---- auto ----
    if nvidia:
        info = _nvidia_info()
        logger.info("[device] GPU detectada: %s (%s MiB) => CUDA/%s", nvidia.name, nvidia.vram_mib, info.compute_type)
        return info

    if amd and shutil.which("rocm-smi"):
        compute = "float16" if (amd.vram_mib or 0) >= VRAM_FLOAT16_THRESHOLD_MIB else "int8_float16"
        info = DeviceInfo(
            engine="faster-whisper",
            device="cuda",
            compute_type=compute,
            gpu_name=amd.name,
            gpu_vram_mib=amd.vram_mib,
            backend="rocm",
            gpus=[g.to_dict() for g in gpus],
            notes=f"GPU AMD detectada via ROCm: {amd.name} => ROCm/{compute}",
        )
        logger.info("[device] GPU AMD ROCm detectada: %s => ROCm/%s", amd.name, compute)
        return info

    if non_nvidia:
        if engine_pref in ("whisper-cpp", "auto"):
            if has_cpp:
                target = "metal" if "metal" in non_nvidia.backends else ("vulkan" if "vulkan" in non_nvidia.backends else "cpu")
                note = f"GPU detectada: {non_nvidia.name} => whisper.cpp/{target}"
                if target == "cpu":
                    note += " (sem backend GPU no build atual; roda na CPU)"
                info = DeviceInfo(
                    engine="whisper-cpp", device=target, compute_type="ggml-"+target,
                    gpu_name=non_nvidia.name, gpu_vram_mib=non_nvidia.vram_mib, backend=target,
                    gpus=[g.to_dict() for g in gpus], notes=note,
                )
                logger.info("[device] GPU detectada: %s => whisper.cpp/%s", non_nvidia.name, target)
                return info
            if engine_pref == "whisper-cpp":
                note = (f"GPU detectada: {non_nvidia.name}; WHISPER_ENGINE=whisper-cpp forçado "
                        "mas o binding não está instalado (pip install pywhispercpp). Rodando em CPU/faster-whisper.")
            else:
                note = f"GPU não-NVIDIA presente ({non_nvidia.name}); Whisper.cpp indisponível -> CPU/int8"

            logger.warning("[device] %s", note)
            return _cpu(base, note)
        # engine_pref == faster-whisper
        note = f"GPU não-CUDA presente ({non_nvidia.name}); WHISPER_ENGINE=faster-whisper força CPU"
        logger.info("[device] %s", note)
        return _cpu(base, note)

    logger.info("[device] Nenhuma GPU detectada => CPU/int8")
    return _cpu(base, "Nenhuma GPU detectada")


def resolve_device(settings: Settings) -> DeviceInfo:
    mode = (settings.whisper_device or "auto").strip().lower()
    gpus = detect_gpus()
    selected = select_engine(settings, gpus, mode)
    set_current(selected)
    return get_current()