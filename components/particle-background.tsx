export function ParticleBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="industrial-grid absolute inset-0 opacity-70" />
      <div className="absolute left-[-10%] top-16 h-px w-[120%] bg-gradient-to-r from-transparent via-primary/45 to-transparent" />
      {Array.from({ length: 12 }).map((_, index) => (
        <span
          key={index}
          className="absolute h-1 w-1 rounded-sm bg-white/30"
          style={{
            left: `${8 + ((index * 13) % 84)}%`,
            top: `${18 + ((index * 19) % 64)}%`,
          }}
        />
      ))}
      <div className="absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}