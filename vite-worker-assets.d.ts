// Vite'ın `?worker&url` sorgu son ekiyle içe aktarılan modüller: worker
// bağımlılıklarıyla birlikte paketlenir ve dışa aktarılan değer, üretilen
// dosyanın adresidir. Bu bildirim olmadan TypeScript içe aktarımı çözemiyor
// (bkz. components/GpsMapView.tsx — MapLibre worker adresi).
declare module "*?worker&url" {
  const workerUrl: string;
  export default workerUrl;
}
