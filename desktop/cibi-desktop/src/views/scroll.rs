//! Smooth wheel scrolling for a vertical page. GPUI 0.3.8 has no wheel easing or delta
//! setting (checked gpui-pre-0.3.8 elements/div.rs and window.rs, gpui-component scroll/),
//! so wheel input moves a target offset and each frame eases the real offset toward it.
//! Drop-in: `smooth_scroll("page-id", window, cx, content)` replaces `.overflow_y_scroll()`.
use gpui_kit::*;
use std::time::Instant;

/// Ease time constant: ~95% of a wheel notch lands in ~150 ms.
const TAU: f32 = 0.05;

/// Frame-rate independent exponential ease toward `target`.
pub fn ease_toward(offset: f32, target: f32, dt: f32) -> f32 {
    offset + (target - offset) * (1.0 - (-dt / TAU).exp())
}

/// Keeps a scroll offset inside `[0, max]`.
pub fn clamp_scroll(v: f32, max: f32) -> f32 {
    v.clamp(0.0, max.max(0.0))
}

#[derive(Default)]
struct Smooth {
    offset: f32,
    target: f32,
    max: f32,
    view_h: f32,
    last: Option<Instant>,
}

/// Vertical scroll container with eased wheel scrolling. State is keyed by `id`.
pub fn smooth_scroll(
    id: &'static str,
    window: &mut Window,
    cx: &mut App,
    content: impl IntoElement,
) -> impl IntoElement {
    let st = window.use_keyed_state(id, cx, |_, _| Smooth::default());
    let now = Instant::now();
    let (offset, moving) = st.update(cx, |s, _| {
        let dt = s.last.map_or(0.0, |t| now.duration_since(t).as_secs_f32()).min(0.1);
        s.last = Some(now);
        s.target = clamp_scroll(s.target, s.max);
        s.offset = ease_toward(s.offset, s.target, dt);
        if (s.target - s.offset).abs() < 0.5 {
            s.offset = s.target;
        }
        (s.offset, s.offset != s.target)
    });
    if moving {
        window.request_animation_frame();
    }
    let (wheel, measure, view) = (st.clone(), st.clone(), st.clone());
    let inner = div()
        .relative()
        .w_full()
        .top(px(-offset))
        .on_children_prepainted(move |b, _, cx| {
            let top = b.iter().map(|b| f32::from(b.top())).fold(f32::MAX, f32::min);
            let bot = b.iter().map(|b| f32::from(b.bottom())).fold(f32::MIN, f32::max);
            if top <= bot {
                measure.update(cx, |s, _| s.max = (bot - top - s.view_h).max(0.0));
            }
        })
        .child(content);
    div()
        .id(id)
        .relative()
        .size_full()
        .overflow_hidden()
        .on_scroll_wheel(move |ev, window, cx| {
            let dy = f32::from(ev.delta.pixel_delta(window.line_height()).y);
            wheel.update(cx, |s, _| s.target = clamp_scroll(s.target - dy, s.max));
            window.request_animation_frame();
        })
        .child(canvas(
            move |b, _, cx| view.update(cx, |s, _| s.view_h = f32::from(b.size.height)),
            |_, _, _, _| {},
        ).absolute().size_full())
        .child(inner)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Glob-imported gpui_kit exports a `test` macro that shadows std's #[test].
    #[core::prelude::v1::test]
    fn ease_and_clamp() {
        // Moves toward target without overshoot, and is frame-rate independent in its limit.
        let a = ease_toward(0.0, 100.0, 0.016);
        assert!(a > 0.0 && a < 100.0);
        assert!(ease_toward(0.0, 100.0, 1.0) > 99.9);
        assert_eq!(ease_toward(40.0, 40.0, 0.5), 40.0);
        assert_eq!(clamp_scroll(-5.0, 300.0), 0.0);
        assert_eq!(clamp_scroll(999.0, 300.0), 300.0);
        assert_eq!(clamp_scroll(10.0, -1.0), 0.0);
    }
}
