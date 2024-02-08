return {

    {
        "jbyuki/nabla.nvim",
        ft = {"markdown", "norg"},
        keys = {
            { "<S-E>", ':lua require"nabla".toggle_virt()<cr>', "toggle equations" },
            { "<S-H>", ':lua require"nabla".popup()<cr>',       "hover equation" },
        },
    },
}
