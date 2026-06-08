type Props = {
  height?: number;
  width?: number;
};

export function ZitadelLogo({ height = 40, width = 147.5 }: Props) {
  return (
    <div className="flex items-center gap-2">
      <img height={height} width={height} src="/logo-hex-solid.svg" alt="SquadOS logo" style={{ objectFit: 'contain' }} />
      <span className="text-xl font-bold tracking-tight text-ink dark:text-white" style={{ fontFamily: 'Montserrat, sans-serif' }}>SQUADOS</span>
    </div>
  );
}
