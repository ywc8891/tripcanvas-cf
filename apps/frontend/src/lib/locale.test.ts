import { describe, it, expect } from 'vitest';
import { wpUploadToMediaUrl, MEDIA_BASE_URL } from './locale';

describe('MEDIA_BASE_URL', () => {
  it('is the media custom domain', () => {
    expect(MEDIA_BASE_URL).toBe('https://media.tripcanvas.co');
  });
});

describe('wpUploadToMediaUrl', () => {
  it('maps each market host to its R2 key prefix', () => {
    expect(wpUploadToMediaUrl('indonesia.tripcanvas.co', '/wp-content/uploads/2019/03/foo.jpg'))
      .toBe('https://media.tripcanvas.co/id/2019/03/foo.jpg');
    expect(wpUploadToMediaUrl('malaysia.tripcanvas.co', '/wp-content/uploads/2019/07/bar.png'))
      .toBe('https://media.tripcanvas.co/my/2019/07/bar.png');
    expect(wpUploadToMediaUrl('thailand.tripcanvas.co', '/wp-content/uploads/2020/01/baz.gif'))
      .toBe('https://media.tripcanvas.co/th/2020/01/baz.gif');
    expect(wpUploadToMediaUrl('tripcanvas.co', '/wp-content/uploads/2018/12/qux.jpg'))
      .toBe('https://media.tripcanvas.co/en/2018/12/qux.jpg');
  });

  it('falls back to en for unknown hosts', () => {
    expect(wpUploadToMediaUrl('example.com', '/wp-content/uploads/2019/03/foo.jpg'))
      .toBe('https://media.tripcanvas.co/en/2019/03/foo.jpg');
  });

  it('strips the WordPress -WxH thumbnail suffix', () => {
    expect(wpUploadToMediaUrl('indonesia.tripcanvas.co', '/wp-content/uploads/2019/03/foo-300x200.jpg'))
      .toBe('https://media.tripcanvas.co/id/2019/03/foo.jpg');
    expect(wpUploadToMediaUrl('indonesia.tripcanvas.co', '/wp-content/uploads/2019/03/foo-768x512.png'))
      .toBe('https://media.tripcanvas.co/id/2019/03/foo.png');
  });

  it('preserves -scaled and other non-size hyphenated names', () => {
    expect(wpUploadToMediaUrl('indonesia.tripcanvas.co', '/wp-content/uploads/2019/03/foo-scaled.jpg'))
      .toBe('https://media.tripcanvas.co/id/2019/03/foo-scaled.jpg');
    expect(wpUploadToMediaUrl('indonesia.tripcanvas.co', '/wp-content/uploads/2019/03/my-cool-photo.jpg'))
      .toBe('https://media.tripcanvas.co/id/2019/03/my-cool-photo.jpg');
  });

  it('preserves multisite sites/N sub-paths', () => {
    expect(wpUploadToMediaUrl('thailand.tripcanvas.co', '/wp-content/uploads/sites/2/2019/03/foo-300x200.jpg'))
      .toBe('https://media.tripcanvas.co/th/sites/2/2019/03/foo.jpg');
  });

  it('returns null for non-upload paths', () => {
    expect(wpUploadToMediaUrl('tripcanvas.co', '/wp-content/themes/x/style.css')).toBeNull();
    expect(wpUploadToMediaUrl('tripcanvas.co', '/blog/some-post')).toBeNull();
    expect(wpUploadToMediaUrl('tripcanvas.co', '/')).toBeNull();
  });
});
