interface Logo {
  id: string;
  description: string;
  image: string;
  className?: string;
}

interface Logos3Props {
  heading?: string;
  logos: Logo[];
  className?: string;
}

function Logos3({ heading = "Supported channels and systems", logos, className = "" }: Logos3Props) {
  const repeatedLogos = [...logos, ...logos];

  return (
    <section className={`logos3 ${className}`} aria-label={heading}>
      <div className="logos3-header">
        <p className="eyebrow">{heading}</p>
      </div>
      <div className="logos3-viewport">
        <div className="logos3-track">
          {repeatedLogos.map((logo, index) => (
            <div className="logos3-item" key={`${logo.id}-${index}`} aria-hidden={index >= logos.length}>
              <img src={logo.image} alt={index < logos.length ? logo.description : ""} className={logo.className} loading="eager" />
              <span>{logo.description}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export type { Logo };
export { Logos3 };
