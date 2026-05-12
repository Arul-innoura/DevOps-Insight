/**
 * Lightweight full-viewport “torn paper / confetti” burst for ticket close etc.
 * Self-removing; safe to call from any dashboard handler.
 */
export function launchPaperCelebration() {
    if (typeof document === "undefined") return;
    const layer = document.createElement("div");
    layer.className = "paper-celebration-layer";
    layer.setAttribute("aria-hidden", "true");
    const colors = [
        "#f472b6", "#fb923c", "#facc15", "#4ade80", "#22d3ee",
        "#818cf8", "#c084fc", "#f87171", "#2dd4bf", "#fbbf24"
    ];
    const count = 36;
    for (let i = 0; i < count; i++) {
        const shard = document.createElement("span");
        shard.className = "paper-celebration-shard";
        const w = 6 + Math.random() * 10;
        const h = 10 + Math.random() * 18;
        const x = Math.random() * 100;
        const delay = Math.random() * 0.12;
        const rot = (Math.random() - 0.5) * 720;
        const dx = (Math.random() - 0.5) * 220;
        const dy = 80 + Math.random() * 220;
        shard.style.width = `${w}px`;
        shard.style.height = `${h}px`;
        shard.style.left = `${x}%`;
        shard.style.top = "-12%";
        shard.style.background = colors[i % colors.length];
        shard.style.setProperty("--pc-rot", `${rot}deg`);
        shard.style.setProperty("--pc-dx", `${dx}px`);
        shard.style.setProperty("--pc-dy", `${dy}px`);
        shard.style.animationDelay = `${delay}s`;
        layer.appendChild(shard);
    }
    document.body.appendChild(layer);
    window.setTimeout(() => {
        layer.remove();
    }, 2400);
}
