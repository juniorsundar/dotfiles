return {

    {
        "jbyuki/nabla.nvim",
        keys = {
            { "<S-E>", ':lua require"nabla".toggle_virt()<cr>', "toggle equations" },
            { "<S-H>", ':lua require"nabla".popup()<cr>',       "hover equation" },
        },
    },
}
