use crate::state::AppState;
use gpui_kit::*;

pub struct Accounts {
    #[allow(dead_code)]
    pub state: Entity<AppState>,
}

impl Render for Accounts {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div().p_6().text_xl().child("Accounts")
    }
}
