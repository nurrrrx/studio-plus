// Blueprint splash. Shown for ~3s on every load before fading into the home
// page. Single brand mark: "studio" with a superscript +.
export default function Loader({ visible }) {
  return (
    <div className={`loader-blueprint ${visible ? '' : 'fade-out'}`} aria-hidden={!visible}>
      <div className="loader-blueprint-grid" />
      <div className="loader-blueprint-vignette" />
      <div className="loader-blueprint-content">
        <div className="loader-blueprint-title">
          studio<sup className="loader-blueprint-plus">+</sup>
        </div>
        <div className="loader-blueprint-progress">
          <span />
        </div>
      </div>
    </div>
  );
}
